# BlockNote 본문 이미지 업로드 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BlockNote 에디터에서 본문에 이미지를 업로드/삽입하고, 폼 저장 시 미사용 이미지를 자동 정리한다.

**Architecture:** 별도 테이블 `qp_content_inline_images` + 별도 폴더 `UPLOAD_DIR/inline-images/{yyyy}/{mm}/`. `POST /api/inline-images` 업로드 → `/api/inline-images/{id}` URL 반환 → BlockNote `uploadFile` 어댑터가 본문 `<img src>`로 삽입. 콘텐츠 저장 시 `reconcileInlineImages`가 본문에 사용되지 않은 이미지를 트랜잭션 내에서 정리.

**Tech Stack:** Next.js 16 App Router · Prisma 7 + MariaDB · BlockNote 0.49 · TypeScript strict · React 19.2 (Compiler 활성)

**Spec:** `docs/superpowers/specs/2026-04-30-blocknote-inline-image-upload-design.md` (커밋 `2fe4d1d`)

**Verification convention:**
이 프로젝트는 단위 테스트 러너가 없습니다. 각 task는 다음 체크로 verification합니다:
- `pnpm lint` — type/lint
- `pnpm build` — production build (Prisma generate + Next.js build)
- 수동 시나리오 (spec §8) — 마지막 task에서 일괄 수행

각 task 종료 시 lint·build가 성공해야 다음 task로 진행합니다.

---

## Task 1: Prisma 스키마 — `ContentInlineImage` 모델 추가

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: enum과 모델 추가**

`prisma/schema.prisma` 끝의 enum 블록 근처에 새 enum을 추가하고, `model Content`의 끝 부분에 역참조 라인을 추가하고, `model ContentAttachment` 직후에 새 모델을 추가합니다.

`Content` 모델에 한 줄 추가 (다른 relation들 옆):
```prisma
inlineImages     ContentInlineImage[]
```

`model ContentAttachment {...}` 블록 직후에 추가:
```prisma
/// 본문 임베드 이미지 (BlockNote 에디터 업로드)
/// 첨부파일과 라이프사이클이 다름:
///   - 폼 저장 전 contentId=null 상태로 디스크/DB에 선존재
///   - 폼 저장 시 본문 HTML에 사용된 ID만 contentId로 stamp, 나머지 즉시 삭제
model ContentInlineImage {
  id          Int      @id @default(autoincrement())
  contentId   Int?     @map("content_id")
  ownerType   qp_content_inline_images_owner_type @map("owner_type")
  ownerUserId String   @map("owner_user_id") @db.VarChar(255)
  fileName    String   @map("file_name") @db.VarChar(255)
  filePath    String   @map("file_path") @db.VarChar(500)
  fileSize    BigInt   @map("file_size")
  mimeType    String   @map("mime_type") @db.VarChar(100)
  createdAt   DateTime @default(now()) @map("created_at")
  content     Content? @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([contentId], map: "idx_content_id")
  @@index([ownerType, ownerUserId, contentId], map: "idx_owner")
  @@map("qp_content_inline_images")
}
```

기존 `enum qp_contents_user_type {...}` 블록 직후에 새 enum을 추가:
```prisma
enum qp_content_inline_images_owner_type {
  ADMIN
  STORE
  SEKO
  GENERAL
}
```

- [ ] **Step 2: 마이그레이션 생성·적용**

Run: `pnpm prisma migrate dev --name add_content_inline_images`
Expected: `prisma/migrations/{timestamp}_add_content_inline_images/migration.sql` 생성, DB에 `qp_content_inline_images` 테이블 + FK + 인덱스 적용. `Prisma Client`가 자동 재생성.

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build`
Expected: 성공. `prisma.contentInlineImage` 가 client에 노출되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: ContentInlineImage 모델 및 마이그레이션 추가

본문 임베드 이미지를 첨부파일과 분리해 별도 테이블로 관리.
contentId nullable로 폼 저장 전 선업로드 → 저장 시 stamp/cleanup."
```

---

## Task 2: 이미지 검증 유틸 작성

**Files:**
- Create: `src/lib/inline-image-validation.ts`

- [ ] **Step 1: 검증 모듈 작성**

`src/lib/inline-image-validation.ts`:
```ts
/**
 * 본문 임베드 이미지(BlockNote 업로드) 검증.
 *
 * 첨부파일(file-validation.ts)과 별개:
 *   - 한도 5MB (첨부 50MB보다 빡빡 — 페이지 로딩 보호)
 *   - 화이트리스트 jpg/jpeg/png/gif/webp (bmp/svg 제외)
 *   - svg 차단 사유: 스크립트 임베드 가능 → stored XSS 위험
 */

export const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_INLINE_IMAGE_EXTENSIONS = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

export const ALLOWED_INLINE_IMAGE_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type InlineImageValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 단일 이미지 파일 검증. 실패 메시지는 사용자에게 그대로 노출되는 일본어.
 */
export function validateInlineImage(file: File): InlineImageValidationResult {
  if (file.size === 0) {
    return { ok: false, error: "空のファイルはアップロードできません" };
  }
  if (file.size > MAX_INLINE_IMAGE_SIZE) {
    return {
      ok: false,
      error: "画像サイズが5MBを超えています",
    };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_INLINE_IMAGE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: "許可されていない画像形式です",
    };
  }

  const mime = file.type || "";
  if (!mime) {
    // 빈 MIME 케이스: 확장자 화이트리스트 통과만 신뢰 (감사 로그)
    console.warn("[inline-image-validation] 빈 MIME 수신 — 확장자 기반 통과:", {
      ext,
      size: file.size,
    });
    return { ok: true };
  }

  if (!ALLOWED_INLINE_IMAGE_MIMES.has(mime)) {
    return {
      ok: false,
      error: "許可されていない画像形式です",
    };
  }
  return { ok: true };
}
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/inline-image-validation.ts
git commit -m "feat: 본문 임베드 이미지 검증 유틸 추가

5MB 한도, jpg/jpeg/png/gif/webp 화이트리스트, svg 차단."
```

---

## Task 3: 본문 ID 추출기 작성

**Files:**
- Create: `src/lib/block-editor/extract-inline-image-ids.ts`

- [ ] **Step 1: 추출기 작성**

`src/lib/block-editor/extract-inline-image-ids.ts`:
```ts
/**
 * 본문 HTML에서 사용 중인 inline-image ID 추출.
 *
 * sanitize-html이 통과시킨 본문이라 `/api/inline-images/{id}` 형태만 들어옴.
 * cheerio/jsdom 도입 없이 정규식으로 충분.
 *
 * - 음수/0/소수/매우 큰 정수(Number 안전 범위 초과) 모두 제외
 * - 동일 ID가 여러 번 등장해도 Set으로 중복 제거
 */

const INLINE_IMAGE_ID_PATTERN = /\/api\/inline-images\/(\d+)/g;
const MAX_SAFE_DB_ID = Number.MAX_SAFE_INTEGER;

export function extractInlineImageIds(
  body: string | null | undefined,
): Set<number> {
  if (!body) return new Set();
  const ids = new Set<number>();
  for (const match of body.matchAll(INLINE_IMAGE_ID_PATTERN)) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0 && id <= MAX_SAFE_DB_ID) {
      ids.add(id);
    }
  }
  return ids;
}
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/block-editor/extract-inline-image-ids.ts
git commit -m "feat: 본문 HTML에서 inline-image ID 추출기 추가

정규식 한 줄로 Set 반환 — sanitize 통과 본문에 한정된 안전한 패턴 매칭."
```

---

## Task 4: Active Cleanup 헬퍼 작성

**Files:**
- Create: `src/lib/inline-image-cleanup.ts`

- [ ] **Step 1: 헬퍼 작성**

`src/lib/inline-image-cleanup.ts`:
```ts
import { unlink } from "fs/promises";
import { relative, resolve } from "path";

import type { Prisma } from "@/generated/prisma/client";
import type { qp_content_inline_images_owner_type } from "@/generated/prisma/client";

import { extractInlineImageIds } from "@/lib/block-editor/extract-inline-image-ids";
import { UPLOAD_DIR } from "@/lib/config";
import { isInsideDir } from "@/lib/path-safety";

/**
 * 콘텐츠 저장(POST/PUT) 시 본문 임베드 이미지를 정리한다.
 *
 * 처리 순서:
 *   1) 본문에 사용된 ID는 contentId stamp (이미 stamped면 no-op)
 *   2) 사용되지 않은 이미지 중 본 사용자가 업로드한 것(또는 수정 시 본 콘텐츠 매핑) 식별
 *   3) DB 행 삭제
 *   4) 디스크 unlink 경로를 호출자에게 반환 (트랜잭션 commit 후 후처리)
 *
 * 안전 제약:
 *   - 삭제 대상은 항상 ownerType+ownerUserId 일치 (contentId=null) 또는 본 콘텐츠 매핑(contentId 일치)
 *   - 다른 사용자의 작업 중 오펀(contentId=null, owner != saver)은 건드리지 않음
 *   - 디스크 unlink는 commit 후 — 롤백 시 파일 보존
 */

interface SaverIdentity {
  userType: qp_content_inline_images_owner_type;
  userId: string;
}

interface ReconcileArgs {
  tx: Prisma.TransactionClient;
  contentId: number;
  body: string | null | undefined;
  user: SaverIdentity;
  isCreate: boolean;
}

interface ReconcileResult {
  /** 트랜잭션 commit 후 unlink할 파일 경로(UPLOAD_DIR 기준 상대) */
  unlinkPaths: string[];
}

export async function reconcileInlineImages(
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const { tx, contentId, body, user, isCreate } = args;
  const usedIds = [...extractInlineImageIds(body)];

  // 1) stamp contentId
  if (usedIds.length > 0) {
    await tx.contentInlineImage.updateMany({
      where: {
        id: { in: usedIds },
        OR: [
          {
            contentId: null,
            ownerType: user.userType,
            ownerUserId: user.userId,
          },
          { contentId },
        ],
      },
      data: { contentId },
    });
  }

  // 2) 삭제 대상 식별
  const orConditions: Prisma.ContentInlineImageWhereInput[] = [
    {
      contentId: null,
      ownerType: user.userType,
      ownerUserId: user.userId,
    },
  ];
  if (!isCreate) orConditions.push({ contentId });

  const toDelete = await tx.contentInlineImage.findMany({
    where: {
      AND: [
        // notIn 빈 배열은 모든 행 일치 → 0 sentinel로 회피
        { id: { notIn: usedIds.length > 0 ? usedIds : [0] } },
        { OR: orConditions },
      ],
    },
    select: { id: true, filePath: true },
  });

  if (toDelete.length === 0) return { unlinkPaths: [] };

  // 3) DB 삭제
  await tx.contentInlineImage.deleteMany({
    where: { id: { in: toDelete.map((r) => r.id) } },
  });

  return { unlinkPaths: toDelete.map((r) => r.filePath) };
}

/**
 * 디스크 unlink 후처리. 트랜잭션 commit 이후에 호출.
 * 실패는 로깅만 — DB 정합성은 이미 보장됨, 디스크 누수는 후속 cron이 회수.
 */
export async function unlinkInlineImagePaths(
  paths: string[],
  logTag: string,
): Promise<void> {
  if (paths.length === 0) return;
  const root = resolve(UPLOAD_DIR);
  for (const filePath of paths) {
    const absolutePath = resolve(UPLOAD_DIR, filePath);
    if (!isInsideDir(absolutePath, root)) {
      console.error(`${logTag} unlink 경로 traversal 의심 — 스킵:`, filePath);
      continue;
    }
    try {
      await unlink(absolutePath);
    } catch (err: unknown) {
      console.error(`${logTag} 디스크 unlink 실패:`, {
        path: relative(UPLOAD_DIR, absolutePath),
        error: err,
      });
    }
  }
}
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공. (이 시점에 enum 타입 import가 정상 작동하는지 확인)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/inline-image-cleanup.ts
git commit -m "feat: inline-image active cleanup 헬퍼 추가

reconcileInlineImages: 본문에 사용된 ID stamp + 미사용 행 식별·삭제.
unlinkInlineImagePaths: 트랜잭션 commit 후 디스크 정리, 실패는 로깅만."
```

---

## Task 5: `POST /api/inline-images` — 업로드 라우트

**Files:**
- Create: `src/app/api/inline-images/route.ts`

- [ ] **Step 1: 라우트 작성**

`src/app/api/inline-images/route.ts`:
```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename, relative, resolve } from "path";
import { randomUUID } from "crypto";

import { requireMenuPermission } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import {
  validateInlineImage,
  MAX_INLINE_IMAGE_SIZE,
} from "@/lib/inline-image-validation";
import { logError } from "@/lib/log-error";
import { isInsideDir } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";

const MAX_REQUEST_SIZE = MAX_INLINE_IMAGE_SIZE + 1024 * 1024; // 5MB + 1MB 헤더 오버헤드

// POST /api/inline-images — 본문 임베드 이미지 업로드
export async function POST(request: NextRequest) {
  try {
    // 권한: CONTENT.create 우선, 실패 시 update fallback (편집 페이지 진입자 대응)
    const authCreate = await requireMenuPermission(
      request.headers,
      "CONTENT",
      "create",
    );
    let user;
    if (authCreate instanceof NextResponse) {
      const authUpdate = await requireMenuPermission(
        request.headers,
        "CONTENT",
        "update",
      );
      if (authUpdate instanceof NextResponse) return authUpdate;
      user = authUpdate.user;
    } else {
      user = authCreate.user;
    }

    // Content-Length 사전 차단 (DoS 방어)
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength === null) {
      console.warn(
        "[POST /api/inline-images] Content-Length 누락 — chunked encoding 거부",
      );
      return NextResponse.json(
        { error: "Content-Lengthヘッダーが必要です" },
        { status: 411 },
      );
    }
    const contentLength = Number(rawContentLength);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return NextResponse.json(
        { error: "リクエストサイズが不正です" },
        { status: 400 },
      );
    }
    if (contentLength > MAX_REQUEST_SIZE) {
      console.warn(
        "[POST /api/inline-images] Content-Length 초과:",
        contentLength,
      );
      return NextResponse.json(
        { error: "リクエストサイズが大きすぎます" },
        { status: 413 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formError: unknown) {
      console.warn("[POST /api/inline-images] multipart 파싱 실패:", formError);
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const rawFile = formData.get("file");
    if (!(rawFile instanceof File)) {
      return NextResponse.json(
        { error: "ファイルを選択してください" },
        { status: 400 },
      );
    }

    const validation = validateInlineImage(rawFile);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 저장 경로: inline-images/yyyy/mm/{uuid}.ext
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const subDir = join("inline-images", yyyy, mm);
    const uploadDir = join(UPLOAD_DIR, subDir);
    await mkdir(uploadDir, { recursive: true });
    const uploadDirAbsolute = resolve(uploadDir);

    const sanitizedName = basename(rawFile.name);
    const ext = (sanitizedName.split(".").pop() ?? "").toLowerCase();
    const safeFileName = `${randomUUID()}${ext ? `.${ext}` : ""}`;
    const relativePath = `${subDir}/${safeFileName}`.replace(/\\/g, "/");
    const absolutePath = resolve(uploadDir, safeFileName);

    if (!isInsideDir(absolutePath, uploadDirAbsolute)) {
      return NextResponse.json(
        { error: "ファイル名が正しくありません" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await rawFile.arrayBuffer());
    await writeFile(absolutePath, buffer);

    try {
      const created = await prisma.contentInlineImage.create({
        data: {
          contentId: null,
          ownerType: user.userType,
          ownerUserId: user.userId,
          fileName: sanitizedName,
          filePath: relativePath,
          fileSize: BigInt(rawFile.size),
          mimeType: rawFile.type || "application/octet-stream",
        },
      });

      return NextResponse.json(
        {
          data: {
            id: created.id,
            url: `/api/inline-images/${created.id}`,
          },
        },
        { status: 201 },
      );
    } catch (dbError: unknown) {
      // DB 실패 시 디스크 파일 정리
      await unlink(absolutePath).catch((unlinkErr: unknown) => {
        console.error("[POST /api/inline-images] DB 실패 후 파일 정리 실패:", {
          path: relative(UPLOAD_DIR, absolutePath),
          error: unlinkErr,
        });
      });
      throw dbError;
    }
  } catch (error: unknown) {
    logError("POST /api/inline-images", error);
    return NextResponse.json(
      { error: "画像のアップロードに失敗しました" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/inline-images/route.ts
git commit -m "feat: POST /api/inline-images 업로드 라우트 추가

CONTENT.create/update 권한, 5MB 한도, multipart 단일 파일,
inline-images/{yyyy}/{mm}/{uuid}.ext 저장 후 ID/URL 응답."
```

---

## Task 6: `GET /api/inline-images/[id]` — 조회 라우트

**Files:**
- Create: `src/app/api/inline-images/[id]/route.ts`

- [ ] **Step 1: 라우트 작성**

`src/app/api/inline-images/[id]/route.ts`:
```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { relative, resolve } from "path";

import { getUserFromHeaders } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/config";
import { isInsideDir, isRegularFile } from "@/lib/path-safety";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/schemas/content";

type Params = { params: Promise<{ id: string }> };

// GET /api/inline-images/:id — 본문 임베드 이미지 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 인증된 사용자만 (게시대상·published 검증은 안 함 — 본문 임베드 가벼운 게이트)
    const user = getUserFromHeaders(request.headers);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const image = await prisma.contentInlineImage.findUnique({
      where: { id: parsed.data },
      select: { filePath: true, mimeType: true },
    });

    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storageRoot = resolve(UPLOAD_DIR);
    const absolutePath = resolve(UPLOAD_DIR, image.filePath);

    if (!isInsideDir(absolutePath, storageRoot)) {
      return NextResponse.json(
        { error: "アクセスできないパスです" },
        { status: 403 },
      );
    }

    const regular = await isRegularFile(absolutePath);
    if (!regular) {
      console.error(
        "[GET /api/inline-images/:id] 정규 파일 아님/부재:",
        relative(UPLOAD_DIR, absolutePath),
      );
      return NextResponse.json(
        { error: "ファイルが見つかりません" },
        { status: 404 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(absolutePath);
    } catch (fsError: unknown) {
      // isRegularFile 통과 후 readFile 사이 TOCTOU 윈도우 방어
      if (
        fsError instanceof Error &&
        "code" in fsError &&
        (fsError as { code?: string }).code === "ENOENT"
      ) {
        console.error(
          "[GET /api/inline-images/:id] 파일 디스크 부재 (TOCTOU):",
          relative(UPLOAD_DIR, absolutePath),
        );
        return NextResponse.json(
          { error: "ファイルが見つかりません" },
          { status: 404 },
        );
      }
      throw fsError;
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": image.mimeType || "application/octet-stream",
        "Content-Disposition": "inline",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/inline-images/:id]", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/inline-images/[id]/route.ts
git commit -m "feat: GET /api/inline-images/:id 조회 라우트 추가

인증된 사용자만, path traversal/symlink 차단, inline disposition,
private cache 1시간."
```

---

## Task 7: `sanitize-html` 패턴 갱신

**Files:**
- Modify: `src/lib/block-editor/sanitize-html.ts`

- [ ] **Step 1: 패턴 확장**

`src/lib/block-editor/sanitize-html.ts`의 `SAFE_IMG_SRC_PATTERN`을 변경:

기존:
```ts
const SAFE_IMG_SRC_PATTERN = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;
```

신규:
```ts
const SAFE_IMG_SRC_PATTERN =
  /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|\/api\/inline-images\/\d+$)/i;
```

`/api/inline-images/{숫자}` 형태의 상대 경로만 통과. 다른 상대 경로는 여전히 차단.

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/block-editor/sanitize-html.ts
git commit -m "feat: sanitize-html SAFE_IMG_SRC에 inline-image 경로 허용

본문에 임베드된 /api/inline-images/{id} URL이 sanitize 통과하도록
화이트리스트 확장. 다른 상대 경로는 여전히 차단."
```

---

## Task 8: `BlockEditor` `uploadFile` 어댑터 + `onUploadError` 옵션

**Files:**
- Modify: `src/components/common/block-editor/block-editor.types.ts`
- Modify: `src/components/common/block-editor/block-editor.tsx`
- Modify: `src/components/common/block-editor/block-editor-loader.tsx` (만약 props 통과만 한다면 자동 통과)

- [ ] **Step 1: 타입에 `onUploadError` 추가**

`src/components/common/block-editor/block-editor.types.ts` — `BlockEditorProps` 인터페이스에 추가:
```ts
/** 이미지 업로드 실패 시 호출자에게 알림 — 호출자가 일본어 alert을 띄울 수 있게 훅 제공 */
onUploadError?: (error: unknown) => void;
```

- [ ] **Step 2: `uploadFile` 어댑터 연결**

`src/components/common/block-editor/block-editor.tsx`:

상단 import 추가:
```ts
import api from "@/lib/axios";
```

함수 시그니처에 `onUploadError` 추가:
```ts
export function BlockEditor({
  defaultValue,
  onChange,
  onParseError,
  onUploadError,
  placeholder,
  editable = true,
  ariaLabel,
}: BlockEditorProps) {
```

`useCreateBlockNote` 호출 부분을 다음과 같이 변경 (기존 `onUploadError` ref 패턴은 `onParseError`와 동일):
```ts
// onUploadError를 ref로 잡아 useCreateBlockNote deps에 새 함수가 들어가지 않게 한다.
const onUploadErrorRef = useRef(onUploadError);
useEffect(() => {
  onUploadErrorRef.current = onUploadError;
}, [onUploadError]);

const editor = useCreateBlockNote({
  schema: allowedBlocksSchema,
  dictionary: locales.ja,
  uploadFile: async (file: File): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ data: { id: number; url: string } }>(
        "/inline-images",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data.data.url;
    } catch (error: unknown) {
      console.error("[BlockEditor] 이미지 업로드 실패:", error);
      onUploadErrorRef.current?.(error);
      throw error; // BlockNote가 에디터 내부 에러 표시 처리
    }
  },
});
```

- [ ] **Step 3: 로더 props 통과 확인**

`src/components/common/block-editor/block-editor-loader.tsx`은 `BlockEditorLoader(props: BlockEditorProps)` 패턴이라 자동으로 새 prop이 통과됩니다. 코드 변경 불필요.

- [ ] **Step 4: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/components/common/block-editor/
git commit -m "feat: BlockEditor에 이미지 업로드 어댑터 연결

useCreateBlockNote에 uploadFile 옵션으로 POST /api/inline-images 호출.
URL 반환으로 BlockNote가 본문에 <img src> 자동 삽입.
onUploadError prop으로 호출자가 일본어 alert을 띄울 수 있게 훅 추가."
```

---

## Task 9: `ContentsForm`에서 업로드 에러 alert 연결

**Files:**
- Modify: `src/components/contents/create/contents-form-editor.tsx`
- Modify: `src/components/contents/create/contents-form.tsx`

- [ ] **Step 1: `ContentsFormEditor`에 prop 통과 추가**

`src/components/contents/create/contents-form-editor.tsx`:

interface에 추가:
```ts
onContentUploadError?: (error: unknown) => void;
```

함수 시그니처에 받아 `BlockEditorLoader`로 통과:
```tsx
export function ContentsFormEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
  onContentParseError,
  onContentUploadError,
}: ContentsFormEditorProps) {
  // ...
  <BlockEditorLoader
    defaultValue={content}
    onChange={onContentChange}
    onParseError={onContentParseError}
    onUploadError={onContentUploadError}
    ariaLabel="内容を入力"
    placeholder="内容を入力してください"
  />
```

- [ ] **Step 2: `ContentsFormInner`에서 alert 핸들러 작성·연결**

`src/components/contents/create/contents-form.tsx`의 `ContentsFormInner` 안 — 기존 `handleContentParseError` 근처에 추가:
```ts
const handleContentUploadError = (error: unknown) => {
  console.error("[Contents] 이미지 업로드 실패:", error);
  // axios 에러에서 일본어 메시지 추출 (서버가 내려준 user-facing 메시지)
  let message = "画像のアップロードに失敗しました。しばらくしてからお試しください。";
  if (isAxiosError(error) && error.response) {
    const data: unknown = error.response.data;
    if (
      data != null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      message = (data as { error: string }).error;
    }
  }
  openAlert({ type: "alert", message });
};
```

`<ContentsFormEditor />` 호출에 prop 추가:
```tsx
<ContentsFormEditor
  title={title}
  onTitleChange={setTitle}
  content={content}
  onContentChange={setContent}
  onContentParseError={handleContentParseError}
  onContentUploadError={handleContentUploadError}
/>
```

- [ ] **Step 3: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/components/contents/create/contents-form-editor.tsx src/components/contents/create/contents-form.tsx
git commit -m "feat: 콘텐츠 폼에서 이미지 업로드 실패 alert 연결

서버가 내려준 user-facing 메시지(5MB 초과 등)를 그대로 alert에 노출.
axios 에러 외 케이스는 일반 메시지로 폴백."
```

---

## Task 10: `POST /api/contents` — Active Cleanup 통합

**Files:**
- Modify: `src/app/api/contents/route.ts`

- [ ] **Step 1: 트랜잭션화 + cleanup 호출**

`src/app/api/contents/route.ts`의 `POST` 함수 본문 변경 — 기존 `prisma.content.create(...)` 호출을 `$transaction`으로 감싸고 `reconcileInlineImages` 추가.

상단 import 추가:
```ts
import { reconcileInlineImages, unlinkInlineImagePaths } from "@/lib/inline-image-cleanup";
```

`POST` 함수 내 `const content = await prisma.content.create({...})` 블록을 다음으로 교체:
```ts
const { unlinkPaths, content } = await prisma.$transaction(async (tx) => {
  const created = await tx.content.create({
    data: {
      ...contentData,
      publishedAt,
      userType: user.userType,
      userId: user.userId,
      createdBy: user.userId,
      authorDepartment:
        contentData.authorDepartment ?? user.department ?? undefined,
      targets: targets ? { create: targets } : undefined,
      categories: categoryIds
        ? {
            create: categoryIds.map((categoryId) => ({
              categoryId,
              createdBy: user.userId,
            })),
          }
        : undefined,
    },
    include: {
      targets: true,
      categories: { include: { category: CATEGORY_TREE_INCLUDE } },
    },
  });

  const reconcile = await reconcileInlineImages({
    tx,
    contentId: created.id,
    body: contentData.body,
    user: { userType: user.userType, userId: user.userId },
    isCreate: true,
  });

  return { content: created, unlinkPaths: reconcile.unlinkPaths };
});

// 트랜잭션 commit 후 디스크 정리 — 실패해도 응답은 정상
await unlinkInlineImagePaths(unlinkPaths, "[POST /api/contents]");
```

응답 부분의 `content` 변수는 그대로 사용:
```ts
return NextResponse.json({
  data: {
    ...content,
    categories: buildCategoryTree(content.categories, { includeInternal: true }),
  },
}, { status: 201 });
```

- [ ] **Step 2: 타입 호환 — `user.userType`이 `qp_content_inline_images_owner_type`과 호환되는지 확인**

`requireMenuPermission`이 반환하는 `user.userType`은 `LoginUser`의 `userType` 필드. 새 enum은 같은 4개 값을 가지므로 타입 불일치가 발생할 수 있습니다. `pnpm lint`에서 에러가 나면 명시 캐스팅:

```ts
user: {
  userType: user.userType as qp_content_inline_images_owner_type,
  userId: user.userId,
},
```

import: `import type { qp_content_inline_images_owner_type } from "@/generated/prisma/client";`

(가능하면 캐스팅 없이 통과하는 것이 우선. 캐스팅이 필요한 경우만 추가)

- [ ] **Step 3: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/contents/route.ts
git commit -m "feat: POST /api/contents에 inline-image active cleanup 통합

콘텐츠 INSERT와 같은 트랜잭션에서 본문 사용 이미지 stamp,
미사용 행 삭제. 디스크 unlink는 commit 후 후처리."
```

---

## Task 11: `PUT /api/contents/:id` — Active Cleanup 통합

**Files:**
- Modify: `src/app/api/contents/[id]/route.ts`

- [ ] **Step 1: 기존 트랜잭션에 cleanup 추가**

`src/app/api/contents/[id]/route.ts`의 `PUT` 함수 — 이미 `$transaction`으로 감싸져 있으므로 그 안에 `reconcileInlineImages` 호출만 추가하고 결과를 반환합니다.

상단 import 추가:
```ts
import { reconcileInlineImages, unlinkInlineImagePaths } from "@/lib/inline-image-cleanup";
```

`PUT` 함수 내 `const content = await prisma.$transaction(async (tx) => {...})` 블록을 다음으로 교체:
```ts
const { content, unlinkPaths } = await prisma.$transaction(async (tx) => {
  if (targets) {
    await tx.contentTarget.deleteMany({
      where: { contentId: parsed.data },
    });
  }

  if (categoryIds) {
    await tx.contentCategory.deleteMany({
      where: { contentId: parsed.data },
    });
  }

  const updated = await tx.content.update({
    where: { id: parsed.data },
    data: {
      ...contentData,
      updatedBy: user.userId,
      targets: targets ? { create: targets } : undefined,
      categories: categoryIds
        ? {
            create: categoryIds.map((categoryId) => ({
              categoryId,
              createdBy: user.userId,
            })),
          }
        : undefined,
    },
    include: {
      targets: { select: { id: true, targetType: true, startAt: true, endAt: true } },
      categories: { include: { category: CATEGORY_TREE_INCLUDE } },
    },
  });

  // body가 update 페이로드에 포함되지 않은 경우(부분 업데이트) cleanup 스킵
  if (contentData.body === undefined) {
    return { content: updated, unlinkPaths: [] };
  }

  const reconcile = await reconcileInlineImages({
    tx,
    contentId: parsed.data,
    body: contentData.body,
    user: { userType: user.userType, userId: user.userId },
    isCreate: false,
  });

  return { content: updated, unlinkPaths: reconcile.unlinkPaths };
});

// 트랜잭션 commit 후 디스크 정리
await unlinkInlineImagePaths(unlinkPaths, "[PUT /api/contents/:id]");
```

응답 부분의 `content` 변수는 그대로 사용:
```ts
return NextResponse.json({
  data: {
    ...content,
    categories: buildCategoryTree(content.categories, { includeInternal: true }),
  },
});
```

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/contents/[id]/route.ts
git commit -m "feat: PUT /api/contents/:id에 inline-image active cleanup 통합

수정 시 본문 업데이트 페이로드가 있으면 stamp + cleanup 실행.
body 미포함 부분 업데이트는 cleanup 스킵 — 의도하지 않은 삭제 방지."
```

---

## Task 12: OpenAPI 스펙 갱신

**Files:**
- Modify: `src/lib/openapi.ts`

- [ ] **Step 1: 스펙 추가**

`src/lib/openapi.ts`를 열고 기존 `paths` 객체 안에 두 엔드포인트 항목을 추가합니다.

먼저 기존 파일 구조를 확인:
Run: `grep -n "/api/contents.*files\|paths\b" src/lib/openapi.ts | head -20`

기존 `paths` 객체의 마지막 엔드포인트 정의 직후에 다음을 추가:
```ts
"/api/inline-images": {
  post: {
    summary: "本文埋め込み画像をアップロード",
    description:
      "BlockNote エディタからの単一画像アップロード。CONTENT.create または update 権限が必要。",
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: { type: "string", format: "binary" },
            },
            required: ["file"],
          },
        },
      },
    },
    responses: {
      "201": {
        description: "アップロード成功",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    url: { type: "string", example: "/api/inline-images/42" },
                  },
                },
              },
            },
          },
        },
      },
      "400": { description: "バリデーション失敗(形式・空ファイル等)" },
      "401": { description: "未認証" },
      "403": { description: "権限不足" },
      "411": { description: "Content-Length ヘッダー欠如" },
      "413": { description: "リクエストサイズ超過" },
      "500": { description: "サーバーエラー" },
    },
  },
},
"/api/inline-images/{id}": {
  get: {
    summary: "本文埋め込み画像を取得",
    description:
      "認証済みユーザのみアクセス可。inline disposition で画像バイナリを返す。",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" },
      },
    ],
    responses: {
      "200": {
        description: "画像バイナリ",
        content: {
          "image/*": { schema: { type: "string", format: "binary" } },
        },
      },
      "401": { description: "未認証" },
      "403": { description: "アクセスできないパス" },
      "404": { description: "画像が見つからない" },
      "500": { description: "サーバーエラー" },
    },
  },
},
```

(기존 파일의 정확한 객체 키 형식·따옴표 스타일에 맞춰 추가하세요. `as const` / `satisfies OpenAPIObject` 등 마지막 어노테이션을 깨지 않게 위치 주의)

- [ ] **Step 2: lint·build 확인**

Run: `pnpm lint && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/openapi.ts
git commit -m "docs: OpenAPI에 inline-images POST/GET 엔드포인트 추가"
```

---

## Task 13: 최종 검증 — lint·build + 수동 시나리오

**Files:** (검증만, 변경 없음)

- [ ] **Step 1: 전체 lint·build 통과 재확인**

Run: `pnpm lint && pnpm build`
Expected: error 0. 신규 도입 warning 0.

- [ ] **Step 2: 개발 서버 기동**

Run: `pnpm dev`
Expected: http://localhost:3000 접근 가능. DB 마이그레이션 완료 상태.

- [ ] **Step 3: 수동 시나리오 (spec §8)**

브라우저로 접근하여 모두 통과 확인:
1. 생성 폼에서 이미지 업로드 → 미리보기 → 폼 저장 → 상세에서 보더 + 이미지 표시 확인
2. 생성 폼에서 이미지 업로드 후 본문에서 삭제 → 폼 저장 → DB(`qp_content_inline_images`)와 디스크에서 제거됐는지 확인
3. 생성 폼에서 이미지 업로드 후 폼 닫기(저장 안 함) → 디스크/DB 잔류(후속 PR 예정 — 정상)
4. 편집 페이지에서 기존 이미지 유지 + 새 이미지 추가 → 저장 → 본문에 둘 다 있고, 새 이미지는 `contentId` 가 stamp됐는지
5. 편집 페이지에서 기존 이미지 일부 삭제 후 저장 → 사라진 이미지의 디스크/DB 정리됐는지
6. 5MB 초과 이미지 업로드 시도 → "画像サイズが5MBを超えています" alert
7. svg 업로드 시도 → "許可されていない画像形式です" alert
8. 비로그인 상태에서 `curl http://localhost:3000/api/inline-images/1` → 401
9. 사용자 A 업로드(저장 전) → 사용자 B 별개 콘텐츠 저장 → A의 오펀이 살아있는지 (DB 확인)

- [ ] **Step 4: 시나리오 결과 기록**

수동 결과 노트(짧게):
- 통과: ___
- 회귀: ___
- 후속 보완 필요: ___

문제 없으면 PR 단계로 진행. 회귀 발견 시 해당 task로 되돌아가 수정.

- [ ] **Step 5: 검증 완료 커밋이 필요하면**

대부분의 경우 추가 커밋 없음. CLAUDE.md/README.md 업데이트가 필요하면 마지막 커밋:
```bash
git add CLAUDE.md README.md
git commit -m "docs: BlockNote 본문 이미지 업로드 기능 안내 추가"
```

---

## Self-Review (작성 후 점검)

**Spec coverage check:**
- §1 결정 사항 → Task 1~12에 모두 반영 ✓
- §2 데이터 모델 → Task 1 ✓
- §3 API 라우트 (POST/GET) → Task 5, 6 ✓
- §4 클라이언트 통합 (uploadFile, sanitize) → Task 7, 8, 9 ✓
- §5 Active Cleanup → Task 4, 10, 11 ✓
- §6 파일 구조 → 모든 task의 Files 섹션에 명시 ✓
- §7 마이그레이션 → Task 1 ✓
- §8 검증 시나리오 → Task 13 ✓
- §9 보안 체크리스트 → 라우트 task에 반영 (path-safety, isRegularFile, sanitize, content-length) ✓
- §10 Out of Scope → 명시적 제외, plan에 cron sweep 없음 ✓
- §11 위험 (권한 매트릭스, enum) → Task 1·5·10에 enum 캐스팅 가이드, 권한 fallback 코드 명시 ✓

**Placeholder scan:** TBD/TODO 없음. 모든 코드 블록 작성됨. ✓

**Type consistency:**
- `reconcileInlineImages` 시그니처(`tx, contentId, body, user, isCreate`)가 Task 4 정의와 Task 10·11 호출 사이트에서 동일 ✓
- `unlinkInlineImagePaths(paths, logTag)` 동일 ✓
- `validateInlineImage(file)`, `MAX_INLINE_IMAGE_SIZE` 명명 일관 ✓
- `extractInlineImageIds` 반환 `Set<number>`, Task 4에서 `[...usedIds]` 변환 ✓
- `BlockEditorProps.onUploadError` 명명, Task 8 (BlockEditor) ↔ Task 9 (ContentsFormEditor `onContentUploadError` 이름은 다르지만 의도된 차이 — 부모 컴포넌트는 자기 도메인 이름 사용) ✓
