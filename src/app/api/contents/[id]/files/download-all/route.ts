import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { basename, relative, resolve } from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// 리뷰 대응: ZIP 리소스 한계 — 비인증 접근이 가능한 스트리밍 엔드포인트이므로
// 파일 수 / 총 바이트수 상한을 둬서 리소스 소진 공격(zip bomb 조립·동시 요청 다수)을 차단.
// 값은 운영 초기 기본치. 추후 콘텐츠 실사용 통계를 바탕으로 조정 가능.
const MAX_ZIP_FILE_COUNT = 200;
const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024; // 500MB
// 단일 파일 분기 상한 — ZIP 분기와 동일 정책으로 대용량 반복 요청에 의한 대역폭 소진을 차단.
// (단일 파일은 ZIP 압축 단계가 없어도 스트리밍 자체로 부하 발생)
const MAX_SINGLE_FILE_BYTES = MAX_ZIP_TOTAL_BYTES;

// 리뷰 대응: Content-Disposition 헤더 인젝션 방어 — 제어 문자 제거 (CR/LF/NUL 등)
function sanitizeHeaderBase(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, "_")
    .replace(/[\/\\?%*:|"<>]/g, "_");
}

/**
 * `Content-Disposition: filename=` 값은 ByteString(latin-1) 만 허용된다.
 * 일본어/한국어 파일명을 그대로 넣으면 `Cannot convert argument to a ByteString` 으로 실패하므로
 * non-ASCII 는 `_` 로 치환한 ASCII fallback 을 만든다. 원본명은 `filename*=UTF-8''` 로 별도 전달.
 *
 * 결과가 빈 문자열/공백뿐이면 `download${ext}` 로 generic fallback (브라우저가 빈 이름을 거부하지 않도록).
 */
function toAsciiHeaderFilename(name: string, fallbackExt: string): string {
  const ascii = sanitizeHeaderBase(name).replace(/[^\x20-\x7e]/g, "_");
  const trimmed = ascii.trim();
  if (trimmed.length === 0 || /^_+$/.test(trimmed)) {
    return `download${fallbackExt}`;
  }
  return ascii;
}

/** 다운로드 시점의 JST(UTC+9) 기준 YYYYMMDD. 일본 운영 사이트 정책. */
function formatDateYYYYMMDDJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// TODO(리뷰 후속 — 경합이 낮음): 동일 파일명 중복 처리를 O(N²) 최악 시나리오에서 O(1) 로 개선 가능
//  (ID 기반 suffix 방식). 실 운영에서 콘텐츠당 첨부 수가 작아 영향 미미하므로 이번 PR 범위 밖.
/** 동일 파일명 충돌 시 ` (1)`, ` (2)` 번호 부여 */
function resolveDuplicateName(used: Set<string>, fileName: string): string {
  if (!used.has(fileName)) {
    used.add(fileName);
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : "";

  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base} (${counter})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

// GET /api/contents/:id/files/download-all — 콘텐츠 첨부파일 전체 ZIP 다운로드
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = getUserFromHeaders(request.headers);

    const { id } = await params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "IDの形式が正しくありません" }, { status: 400 });
    }

    // 콘텐츠 조회 + 접근권한 검증
    // 리뷰 대응: 파일 수 제한(`take`)을 쿼리 수준에서 적용 — 서버 메모리/쿼리 비용 상한 선제 제어
    const content = await prisma.content.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        title: true,
        status: true,
        targets: { select: { roleCode: true, startAt: true, endAt: true } },
        attachments: {
          select: { id: true, fileName: true, filePath: true },
          orderBy: { sortOrder: "asc" },
          take: MAX_ZIP_FILE_COUNT,
        },
      },
    });

    if (!content || content.status !== "published") {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    if (!canAccessContent(user, content.targets)) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 });
    }

    if (content.attachments.length === 0) {
      return NextResponse.json(
        { error: "添付ファイルがありません" },
        { status: 404 },
      );
    }

    // 디스크 파일 존재 확인 (path traversal + symlink 방어 포함)
    // 리뷰 대응: 기존 `for + await stat`는 N회 순차 I/O → `Promise.allSettled` 로 병렬화.
    //            동시에 symlink 가드(`isRegularFile`)로 방어 심층(defense-in-depth) 적용.
    const storageRoot = resolve(UPLOAD_DIR);
    const statResults = await Promise.allSettled(
      content.attachments.map(async (att) => {
        const absolutePath = resolve(UPLOAD_DIR, att.filePath);
        if (!isInsideDir(absolutePath, storageRoot)) {
          throw new Error(`invalid-path:${relative(UPLOAD_DIR, absolutePath)}`);
        }
        // 심볼릭 링크/특수 파일 거부
        if (!(await isRegularFile(absolutePath))) {
          throw new Error(`non-regular:${relative(UPLOAD_DIR, absolutePath)}`);
        }
        const info = await stat(absolutePath);
        return {
          id: att.id,
          fileName: att.fileName,
          absolutePath,
          size: info.size,
        };
      }),
    );

    const validFiles: Array<{ id: number; fileName: string; absolutePath: string; size: number }> = [];
    for (let i = 0; i < statResults.length; i += 1) {
      const r = statResults[i];
      const att = content.attachments[i];
      if (r.status === "fulfilled") {
        validFiles.push(r.value);
      } else {
        console.warn("[download-all] 디스크 파일 누락/차단:", {
          attachmentId: att.id,
          filePath: att.filePath,
          reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { error: "ダウンロード可能なファイルがありません" },
        { status: 404 },
      );
    }

    // 리뷰 대응: 총 바이트 수 상한 검증 — zip bomb 조립/리소스 소진 공격 차단
    const totalBytes = validFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
      console.warn("[download-all] ZIP 총 용량 초과:", { totalBytes, count: validFiles.length });
      return NextResponse.json(
        { error: "ZIPの合計サイズが上限を超えました" },
        { status: 413 },
      );
    }

    // 첨부 1개 분기 — ZIP 생성 없이 원본 파일 직접 다운로드.
    //
    // 운영 정책: 첨부가 1개일 때 굳이 압축할 필요가 없고, 사용자가 ZIP 해제 단계 없이
    // 즉시 사용 가능하도록 원본 그대로 응답한다.
    // - Content-Disposition 의 fileName 은 sanitizeHeaderBase 로 ASCII fallback,
    //   filename* 은 UTF-8 인코딩으로 원본 일본어/한국어 파일명 보존.
    // - DownloadLog 는 단일 행 createMany 로 ZIP 분기와 일관 처리.
    if (validFiles.length === 1) {
      const file = validFiles[0];

      // 단일 파일 분기에도 ZIP 분기와 동일한 크기 상한 적용 — 대역폭 소진 공격 방어.
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        console.warn("[download-all] 단일 파일 용량 초과:", {
          attachmentId: file.id,
          size: file.size,
        });
        return NextResponse.json(
          { error: "ファイルサイズが上限を超えました" },
          { status: 413 },
        );
      }

      const fileStream = createReadStream(file.absolutePath);

      let singleLogFired = false;
      const fireSingleDownloadLog = () => {
        if (singleLogFired) return;
        singleLogFired = true;
        if (!user) return;
        void prisma.downloadLog
          .create({
            data: {
              userType: user.userType,
              userId: user.userId,
              contentId: parsedId.data,
              attachmentId: file.id,
            },
          })
          .catch((err: unknown) => {
            console.error("[download-all] 단일 파일 DownloadLog 기록 실패:", {
              attachmentId: file.id,
              error: err,
            });
          });
      };

      const singleStream = new ReadableStream<Uint8Array>({
        start(controller) {
          // createReadStream 의 data 이벤트는 encoding 미지정 시 Buffer 만 emit 하지만,
          // 타입스크립트 시그니처는 `string | Buffer` union 이라 명시적 narrowing 필요.
          fileStream.on("data", (chunk: string | Buffer) => {
            const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            controller.enqueue(buf);
            if ((controller.desiredSize ?? 0) <= 0) {
              fileStream.pause();
            }
          });
          fileStream.on("end", () => {
            fireSingleDownloadLog();
            controller.close();
          });
          fileStream.on("error", (err: Error) => {
            console.error("[download-all] 단일 파일 stream 에러:", err);
            controller.error(err);
          });
        },
        pull() {
          fileStream.resume();
        },
        cancel() {
          if (!fileStream.destroyed) fileStream.destroy();
        },
      });

      request.signal.addEventListener("abort", () => {
        if (!fileStream.destroyed) fileStream.destroy();
      });

      // Content-Disposition: filename= 은 ByteString(latin-1) 한정 — 일본어/한국어는 ASCII fallback 으로
      // 변환하고, 원본명은 filename*=UTF-8'' 로 별도 전달하여 모던 브라우저가 원본명을 사용한다.
      const baseName = basename(file.fileName);
      const dotIdx = baseName.lastIndexOf(".");
      const ext = dotIdx >= 0 ? baseName.slice(dotIdx) : "";
      const asciiFallback = toAsciiHeaderFilename(baseName, ext);
      return new NextResponse(singleStream, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
          "Content-Length": String(file.size),
          // MIME 스니핑 차단 — md/txt 등 텍스트 파일 인라인 렌더링 우회 차단.
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // ZIP 스트림 생성
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    archive.on("warning", (err: unknown) => {
      console.warn("[download-all] archiver 경고:", err);
    });
    archive.on("error", (err: unknown) => {
      console.error("[download-all] archiver 에러:", err);
      // 에러 즉시 전파 — passThrough 파괴 → webStream controller.error 트리거 → 클라이언트도 끊김 감지
      archive.abort();
      passThrough.destroy(err instanceof Error ? err : new Error(String(err)));
    });

    // 중복 파일명 처리하면서 ZIP에 추가
    // basename으로 한 번 더 sanitize (Zip Slip 방어 — DB의 fileName이 과거 비위생화 데이터일 수 있음)
    const usedNames = new Set<string>();
    for (const f of validFiles) {
      const archivedName = resolveDuplicateName(usedNames, basename(f.fileName));
      archive.append(createReadStream(f.absolutePath), { name: archivedName });
    }

    // 리뷰 대응: floating promise 명시(`void`) — 린트 규칙·lint no-floating-promises 대응.
    //            archiver 에러는 `archive.on('error')`에서 동기적으로 처리되므로 여기서는 로깅만.
    void archive.finalize().catch((err: unknown) => {
      console.error("[download-all] archive.finalize 실패:", err);
    });

    // ZIP 파일명 생성 (안전한 ASCII fallback + UTF-8 인코딩)
    // 리뷰 대응: 제어 문자(CR/LF/NUL 등) 제거 → Content-Disposition 헤더 인젝션 방어
    // 운영 정책: 형식 = "{콘텐츠 제목}_{YYYYMMDD(다운로드 일자, JST)}.zip"
    const safeBaseName = sanitizeHeaderBase(content.title || "content");
    const zipFileName = `${safeBaseName}_${formatDateYYYYMMDDJst()}.zip`;

    // PassThrough → Web ReadableStream
    // - cancel(): 클라이언트가 응답 취소 시 archiver/stream 즉시 정리 (FD 누수 방지)
    // - pull() + desiredSize: 배압 처리 (slow client → archiver pause로 메모리 누수 방지)
    // - request.signal: HTTP 연결 abort 시에도 동일 cleanup
    let logFiredOnce = false;
    const fireDownloadLogIfNeeded = () => {
      if (logFiredOnce) return;
      logFiredOnce = true;
      // DownloadLog 기록은 ZIP이 실제로 클라이언트에게 송출 완료된 시점에서만 작성
      // (이전에는 finalize 직후 기록되어 abort/error 시 false positive 감사 로그 발생)
      if (!user) return;
      // 정책: ZIP 일괄 다운로드 1건 = 콘텐츠 내 모든 첨부에 대해 DownloadLog N행 기록.
      //   사용자가 ZIP 으로 받은 파일 각각이 다운로드 이력 화면에 노출되어야 한다는 운영 요구.
      //   대표 첨부 id 1건만 기록하는 "콘텐츠 단위 1행" 정책은 환원.
      void prisma.downloadLog
        .createMany({
          data: validFiles.map((f) => ({
            userType: user.userType,
            userId: user.userId,
            contentId: parsedId.data,
            attachmentId: f.id,
          })),
        })
        .catch((err: unknown) => {
          console.error("[download-all] DownloadLog 기록 실패:", {
            contentId: parsedId.data,
            bundledCount: validFiles.length,
            error: err,
          });
        });
    };

    // 리뷰 대응: cancel / abort 이벤트 동시 발생 시 `archive.abort()` + `passThrough.destroy()` 이중
    //           호출을 `cleaned` 플래그로 1회만 수행하도록 가드.
    let cleaned = false;
    const cleanupStream = (reason: string) => {
      if (cleaned) return;
      cleaned = true;
      console.warn(`[download-all] ${reason} — archiver/stream 정리`);
      try {
        archive.abort();
      } catch (e: unknown) {
        console.warn("[download-all] archive.abort 중 에러(무시):", e);
      }
      if (!passThrough.destroyed) {
        passThrough.destroy();
      }
    };

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) => {
          controller.enqueue(chunk);
          if ((controller.desiredSize ?? 0) <= 0) {
            passThrough.pause();
          }
        });
        passThrough.on("end", () => {
          fireDownloadLogIfNeeded();
          controller.close();
        });
        passThrough.on("error", (err: Error) => {
          console.error("[download-all] passThrough 에러:", err);
          controller.error(err);
        });
      },
      pull() {
        passThrough.resume();
      },
      cancel() {
        cleanupStream("클라이언트 취소 감지");
      },
    });

    request.signal.addEventListener("abort", () => {
      cleanupStream("request abort 감지");
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`,
        // MIME 스니핑 차단 — 일관성을 위해 ZIP 분기에도 동일 헤더 적용.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/contents/:id/files/download-all] 실패:", error);
    return NextResponse.json(
      { error: "ZIPダウンロードに失敗しました" },
      { status: 500 },
    );
  }
}
