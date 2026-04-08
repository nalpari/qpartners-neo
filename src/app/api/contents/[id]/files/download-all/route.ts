import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { basename, resolve } from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

import { canAccessContent, getUserFromHeaders } from "@/lib/auth";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// 리뷰 대응: ZIP 리소스 한계 — 비인증 접근이 가능한 스트리밍 엔드포인트이므로
// 파일 수 / 총 바이트수 상한을 둬서 리소스 소진 공격(zip bomb 조립·동시 요청 다수)을 차단.
// 값은 운영 초기 기본치. 추후 콘텐츠 실사용 통계를 바탕으로 조정 가능.
const MAX_ZIP_FILE_COUNT = 200;
const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024; // 500MB

// 리뷰 대응: Content-Disposition 헤더 인젝션 방어 — 제어 문자 제거 (CR/LF/NUL 등)
function sanitizeHeaderBase(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, "_")
    .replace(/[\/\\?%*:|"<>]/g, "_");
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
        targets: { select: { targetType: true, startAt: true, endAt: true } },
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
    const storageRoot = resolve(process.cwd(), "storage", "uploads");
    const statResults = await Promise.allSettled(
      content.attachments.map(async (att) => {
        const absolutePath = resolve(process.cwd(), att.filePath);
        if (!isInsideDir(absolutePath, storageRoot)) {
          throw new Error(`invalid-path:${absolutePath}`);
        }
        // 심볼릭 링크/특수 파일 거부
        if (!(await isRegularFile(absolutePath))) {
          throw new Error(`non-regular:${absolutePath}`);
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
    const safeBaseName = sanitizeHeaderBase(content.title || "content");
    const zipFileName = `${safeBaseName}_attachments.zip`;

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
      // 리뷰 대응: N개 parallel `create()` → 커넥션 풀 소진 및 실패 시 감사 로그 소실 위험.
      //           `createMany` 로 단일 쿼리 전환 + 실패 시 단일 로그 요약으로 축약.
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
            count: validFiles.length,
            attachmentIds: validFiles.map((f) => f.id),
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
