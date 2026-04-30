# BlockNote 본문 이미지 업로드 — 디자인 스펙

- 작성일: 2026-04-30
- 대상: `/contents/create`, `/contents/[id]/edit` 페이지의 BlockNote 에디터
- 컨텍스트: 콘텐츠 본문(`Content.body`)에 이미지를 직접 삽입할 수 있도록 BlockNote `uploadFile` 훅을 통한 업로드 파이프라인을 신설한다. 기존 첨부파일(`POST /api/contents/:id/files`)과는 라이프사이클·식별자·접근 정책이 다르기 때문에 별도 자원으로 분리한다.

## 1. 결정 사항 요약

| 항목 | 결정 | 비고 |
|---|---|---|
| 저장 모델 | 신규 테이블 `qp_content_inline_images` (별도 폴더) | 첨부와 분리 |
| 저장 경로 | `UPLOAD_DIR/inline-images/{yyyy}/{mm}/{uuid}.ext` | 월 단위 디렉토리 |
| URL 형식 | `/api/inline-images/{id}` (DB ID) | 인증 미들웨어 통과 필요 |
| 접근 제어 | 인증된 사용자 누구나 (게시대상·published 검증 ❌) | 비용/단순성 우선 |
| 용량 한도 | 5MB | 첨부(50MB)보다 빡빡 |
| 허용 포맷 | jpg, jpeg, png, gif, webp | bmp 제외, svg 차단 |
| 오펀 정리 | 폼 저장 시 active cleanup (트랜잭션 내) | cron sweep은 후속 PR |
| 다운로드 로그 | 기록 안 함 | 본문 임베드라 폭주 우려 |

## 2. 데이터 모델

### 2-1. Prisma 모델

```prisma
/// 본문 임베드 이미지 (BlockNote 에디터 업로드)
/// 첨부파일과 라이프사이클이 다름:
///   - 폼 저장 전 contentId=null 상태로 디스크/DB에 선존재
///   - 폼 저장 시 본문 HTML에 사용된 ID만 contentId로 stamp, 나머지 즉시 삭제
model ContentInlineImage {
  id           Int      @id @default(autoincrement())
  contentId    Int?     @map("content_id")
  ownerType    qp_content_inline_images_owner_type @map("owner_type")
  ownerUserId  String   @map("owner_user_id") @db.VarChar(255)
  fileName     String   @map("file_name") @db.VarChar(255)
  filePath     String   @map("file_path") @db.VarChar(500)
  fileSize     BigInt   @map("file_size")
  mimeType     String   @map("mime_type") @db.VarChar(100)
  createdAt    DateTime @default(now()) @map("created_at")
  content      Content? @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([contentId], map: "idx_content_id")
  @@index([ownerType, ownerUserId, contentId], map: "idx_owner")
  @@map("qp_content_inline_images")
}
```

`Content` 모델에 역참조 한 줄 추가:
```prisma
inlineImages ContentInlineImage[]
```

`qp_content_inline_images_owner_type`은 기존 다른 모델의 `userType` enum 패턴(`qp_contents_user_type` 등)과 동일한 값 집합을 사용하도록 별도 enum으로 정의한다(Prisma는 모델별 enum을 권장).

### 2-2. 오펀 정의
- `contentId IS NULL` AND `createdAt < N일 전` 행이 오펀.
- 이번 PR에서는 active cleanup만 처리. cron sweep은 후속 PR에서 도입(파일·DB 동시 정리).

## 3. API 라우트

### 3-1. `POST /api/inline-images` — 업로드
- **인증**: `requireMenuPermission(headers, "CONTENT", "create")` 우선 시도, 실패 시 `"update"`로 fallback. 둘 다 실패면 403.
- **요청**: multipart, 단일 `file` 필드.
- **사전 차단 (DoS 방어)**: `Content-Length` 헤더 누락 시 411, `MAX_INLINE_IMAGE_SIZE + 1024 * 1024` (5MB + 1MB 헤더 오버헤드) 초과 시 413(첨부 라우트 패턴과 동일 buffer 산식).
- **검증**: 새 유틸 `validateInlineImage(file)` — 5MB, 화이트리스트 확장자/MIME, svg 차단.
- **저장**:
  - 디렉토리: `UPLOAD_DIR/inline-images/{yyyy}/{mm}/`
  - 파일명: `{uuid}.{ext}`
  - `path-safety.isInsideDir`로 traversal 방어.
- **DB**: `INSERT contentId=null, ownerType/ownerUserId=업로더, fileName=basename(file.name), filePath=상대경로(UPLOAD_DIR 기준), fileSize, mimeType`.
- **응답** (201):
  ```json
  { "data": { "id": 42, "url": "/api/inline-images/42" } }
  ```
- **에러 메시지**: 일본어. 로그는 한국어, 토큰·경로 외 PII 미포함(프로젝트 규칙).

### 3-2. `GET /api/inline-images/{id}` — 조회
- **인증**: `getUserFromHeaders` — 미인증 시 401.
- **조회**: `prisma.contentInlineImage.findUnique({ where: { id } })`. 없으면 404.
- **파일 검증**: `path-safety.isInsideDir` + `isRegularFile` (symlink 차단).
- **응답 헤더**:
  - `Content-Type: <mimeType>`
  - `Content-Disposition: inline`
  - `Cache-Control: private, max-age=3600`
- **로그 미기록**: 본문 임베드 호출은 페이지뷰 × N개 이미지 단위로 폭주할 수 있어 `DownloadLog`와 의미가 다름.

### 3-3. 라우트 추가 안 함
- `DELETE /api/inline-images/{id}` ❌ — 본문에서 제거된 이미지는 `POST/PUT /api/contents` 시 active cleanup이 처리.

## 4. 클라이언트 통합

### 4-1. `BlockEditor` `uploadFile` 옵션 연결

`src/components/common/block-editor/block-editor.tsx`:

```tsx
const editor = useCreateBlockNote({
  schema: allowedBlocksSchema,
  dictionary: locales.ja,
  uploadFile: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<{ data: { id: number; url: string } }>(
      "/inline-images",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return res.data.data.url;
  },
});
```

### 4-2. `BlockEditorProps` 확장
```ts
interface BlockEditorProps {
  // ... 기존 필드 ...
  /** 업로드 실패 시 호출자에게 알림 — 호출자가 일본어 메시지 alert 가능 */
  onUploadError?: (error: unknown) => void;
}
```

### 4-3. `sanitize-html.ts` 패턴 갱신

```ts
const SAFE_IMG_SRC_PATTERN =
  /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|\/api\/inline-images\/\d+$)/i;
```

`/api/inline-images/{숫자}` 형태의 상대 경로만 통과시키며 다른 상대 경로는 여전히 차단한다.

## 5. Active Cleanup (폼 저장 시)

### 5-1. 통합 지점
- `POST /api/contents` (생성)
- `PUT /api/contents/:id` (수정)

콘텐츠 INSERT/UPDATE와 **같은 트랜잭션** 내부에서 처리. 디스크 unlink는 트랜잭션 commit 후 후처리.

### 5-2. 본문 ID 추출기
`src/lib/block-editor/extract-inline-image-ids.ts`:

```ts
const INLINE_IMAGE_ID_PATTERN = /\/api\/inline-images\/(\d+)/g;

export function extractInlineImageIds(body: string | null | undefined): Set<number> {
  if (!body) return new Set();
  const ids = new Set<number>();
  for (const match of body.matchAll(INLINE_IMAGE_ID_PATTERN)) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}
```

### 5-3. `reconcileInlineImages` 헬퍼
`src/lib/inline-image-cleanup.ts`:

```ts
export async function reconcileInlineImages(args: {
  tx: PrismaTransactionClient;
  contentId: number;
  body: string | null | undefined;
  user: { userType: UserType; userId: string };
  isCreate: boolean;
}): Promise<{ unlinkPaths: string[] }> {
  const { tx, contentId, body, user, isCreate } = args;
  const usedIds = [...extractInlineImageIds(body)];

  // 1) stamp contentId
  if (usedIds.length > 0) {
    await tx.contentInlineImage.updateMany({
      where: {
        id: { in: usedIds },
        OR: [
          { contentId: null, ownerType: user.userType, ownerUserId: user.userId },
          { contentId },
        ],
      },
      data: { contentId },
    });
  }

  // 2) 삭제 대상 식별
  const orConditions: Prisma.ContentInlineImageWhereInput[] = [
    { contentId: null, ownerType: user.userType, ownerUserId: user.userId },
  ];
  if (!isCreate) orConditions.push({ contentId });

  const toDelete = await tx.contentInlineImage.findMany({
    where: {
      AND: [
        { id: { notIn: usedIds.length > 0 ? usedIds : [0] } }, // 빈 배열 방어
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

  // 4) 디스크 경로 반환 — 트랜잭션 commit 후 호출자가 unlink
  return { unlinkPaths: toDelete.map((r) => r.filePath) };
}
```

### 5-4. 안전성 제약
- 삭제 대상은 **본 사용자가 업로드한 contentId=null 행** 또는 **수정 시 본 콘텐츠에 매핑된 행**으로 한정 → 다른 사용자의 작업 중 오펀을 우발적으로 삭제하지 않음.
- 디스크 unlink는 **트랜잭션 commit 후** 별도 `for...of` + `unlink(...).catch(log)`. 실패해도 DB 정합성은 유지, 디스크 누수만 발생(후속 cron이 회수).
- 트랜잭션 롤백 시 stamp/delete가 모두 원복. 신규 업로드 파일은 디스크에 그대로 남아 다음 저장 시도 시 동일 로직으로 정리.

## 6. 파일 구조 (신규/수정)

### 신규
- `prisma/migrations/{ts}_add_content_inline_images/migration.sql`
- `src/lib/inline-image-validation.ts` — `validateInlineImage()`, `MAX_INLINE_IMAGE_SIZE`, `ALLOWED_INLINE_IMAGE_*`
- `src/lib/block-editor/extract-inline-image-ids.ts`
- `src/lib/inline-image-cleanup.ts` — `reconcileInlineImages`, `unlinkInlineImages` 헬퍼
- `src/app/api/inline-images/route.ts` — `POST`
- `src/app/api/inline-images/[id]/route.ts` — `GET`

### 수정
- `prisma/schema.prisma` — `ContentInlineImage` 모델 + `Content.inlineImages` 역참조
- `src/lib/block-editor/sanitize-html.ts` — `SAFE_IMG_SRC_PATTERN` 확장
- `src/components/common/block-editor/block-editor.tsx` — `uploadFile` 어댑터 + `onUploadError` 호출
- `src/components/common/block-editor/block-editor.types.ts` — `onUploadError?` 옵션
- `src/components/common/block-editor/block-editor-loader.tsx` — props pass-through (필요 시)
- `src/components/contents/create/contents-form-editor.tsx` — `onUploadError` 전달
- `src/components/contents/create/contents-form.tsx` — alert 핸들러 연결
- `src/app/api/contents/route.ts` (POST) — 트랜잭션 내 `reconcileInlineImages` + commit 후 unlink
- `src/app/api/contents/[id]/route.ts` (PUT) — 동일
- `src/lib/openapi.ts` — `/api/inline-images` POST·GET 스펙 추가

## 7. 마이그레이션·실행 순서

1. `prisma/schema.prisma` 수정
2. `pnpm prisma migrate dev --name add_content_inline_images`
3. `pnpm prisma generate` (자동, 명시)
4. `inline-images/` 디렉토리는 라우트에서 lazy `mkdir({ recursive: true })`로 생성 — 시드 불필요

## 8. 검증 시나리오

### 자동
- `pnpm lint` — error 0, 신규 도입 warning 0
- `pnpm tsc --noEmit` — type check 통과
- `pnpm build` — production build 성공

### 수동
1. 생성 폼에서 이미지 업로드 → 미리보기 → 폼 저장 → 상세에서 보더와 함께 표시되는지
2. 생성 폼에서 이미지 업로드 후 본문에서 삭제 → 폼 저장 → DB·디스크에서 제거됐는지
3. 생성 폼에서 이미지 업로드 후 폼 닫기(저장 안 함) → 디스크/DB에 잔류(후속 PR 예정)
4. 편집 페이지에서 기존 이미지 유지 + 새 이미지 추가 → 저장 → 본문 보존, 신규는 stamp
5. 편집 페이지에서 기존 이미지 일부 삭제 + 저장 → 사라진 이미지의 디스크/DB 정리
6. 5MB 초과 이미지 업로드 시도 → 일본어 에러
7. svg 업로드 시도 → 거부
8. 비로그인 상태로 `/api/inline-images/{id}` 직접 접근 → 401
9. 다른 사용자가 업로드한 contentId=null 행이 cleanup으로 삭제되지 않는지 (멀티 사용자 동시 작성 시나리오)

## 9. 보안 체크리스트

| 항목 | 처리 |
|---|---|
| Path traversal | `path-safety.isInsideDir` (저장·조회 양쪽) |
| Symlink 우회 | `isRegularFile` (조회 시) |
| Stored XSS (svg) | `validateInlineImage`에서 svg+xml 명시 차단 |
| 일반 stored XSS | `sanitize-html`이 본문 렌더 직전 처리 (현행 유지) |
| DoS (대용량 body) | `Content-Length` 사전 차단 |
| User enumeration | 라우트가 인증 미들웨어로만 401/200 분기, ID 존재 여부에 따라 메시지 차이 두지 않음 |
| 권한 우회 | 라우트 진입 시 `requireMenuPermission(create OR update)` |
| PII 로깅 | 로그에 `userType`만, email/ID 미노출 |
| 다른 사용자 오펀 삭제 | cleanup `WHERE` 절에 `ownerType+ownerUserId` 강제 |

## 10. Out of Scope (이번 PR 미포함)

- 미저장 폼 abandon 케이스의 cron orphan sweep (별도 PR)
- 클라이언트 측 이미지 압축/리사이즈
- `publicId` 컬럼(추측 방어)
- 이미지 본문 내 `<a href>` wrapping 등 BlockNote 자체 외 확장
- 본문 저장 시점 sanitize 도입(현재는 렌더 시점만)

## 11. 위험·미결정 사항

- **권한 매트릭스**: `CONTENT.create`/`update` 둘 다 매트릭스에 정상 등록되어 있는지 운영자가 확인 필요. 없으면 라우트 진입이 항상 실패.
- **owner_type enum 값**: `Content.userType`과 같은 enum 사용을 권장하나 Prisma에서 모델 간 enum 공유는 별도 정의 필요. 후속 코드 리뷰에서 통일 방안 결정.
- **에디터 내부 다른 file 입력 (file/audio/video 블록)**: 현재 `allowedBlocksSchema`에서 비활성화되어 있어 영향 없음. 추후 활성 시 `uploadFile`이 동일 파이프라인을 타게 될 수 있음(파일 종류 분기 필요).
