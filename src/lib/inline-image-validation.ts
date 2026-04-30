/**
 * BlockNote 본문 임베드 이미지 업로드 검증.
 *
 * 첨부파일 검증(`file-validation.ts`)과 분리:
 *   - 본문 임베드는 페이지 렌더 시 `<img>`로 직렬 호출되어 트래픽이 폭주하기 쉬움 → 첨부파일보다 작은 상한
 *   - bmp 등 거대한 무압축 이미지 차단 (jpg/png/gif/webp만)
 *   - svg는 stored XSS 위험으로 명시 거부
 */

export const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/** 허용 확장자 (소문자) — bmp/svg 제외 */
export const ALLOWED_INLINE_IMAGE_EXTENSIONS = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

/** 허용 MIME (명시 enumeration) — image/* 와일드카드 금지, image/svg+xml 명시 차단 */
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
 * 단일 본문 이미지 검증. 실패 메시지는 사용자 노출용 일본어.
 *
 * MIME 빈 값(file.type === "")은 일부 브라우저(드래그 앤 드롭 경로 등)에서
 * 발생할 수 있으므로 확장자 화이트리스트를 통과하면 경고 로그 후 허용한다.
 */
export function validateInlineImage(file: File): InlineImageValidationResult {
  if (file.size === 0) {
    return { ok: false, error: "空のファイルはアップロードできません" };
  }
  if (file.size > MAX_INLINE_IMAGE_SIZE) {
    return { ok: false, error: "画像サイズが5MBを超えています" };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_INLINE_IMAGE_EXTENSIONS.has(ext)) {
    return { ok: false, error: "許可されていない画像形式です" };
  }

  const mime = file.type || "";
  if (!mime) {
    console.warn("[inline-image-validation] 빈 MIME 수신 — 확장자 기반 통과:", {
      fileName: file.name,
      ext,
      size: file.size,
    });
  } else if (!ALLOWED_INLINE_IMAGE_MIMES.has(mime)) {
    return { ok: false, error: "許可されていない画像形式です" };
  }

  return { ok: true };
}
