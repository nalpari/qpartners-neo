/**
 * 파일 업로드 검증 공통 유틸
 *
 * 콘텐츠 첨부파일 업로드/교체 시 공통으로 사용되는 검증 규칙.
 * - 파일 크기: 50MB 제한
 * - 확장자: PDF/Office/이미지 화이트리스트 (SVG 제외 — XSS 위험)
 * - MIME 타입: 확장자와 이중 검증
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** 허용 확장자 (소문자) — SVG 제외 (XSS 위험) */
export const ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
]);

/** 허용 MIME 타입 (이미지는 startsWith("image/")로 추가 허용) */
export const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 파일 하나의 검증. 크기/확장자/MIME 체크.
 * 실패 메시지는 사용자에게 그대로 노출 가능한 한글 메시지.
 */
export function validateFile(file: File): FileValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `파일 크기가 50MB를 초과합니다: ${file.name}` };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `허용되지 않는 파일 확장자입니다: ${file.name}` };
  }

  const mime = file.type || "";
  if (!ALLOWED_MIMES.includes(mime) && !mime.startsWith("image/")) {
    return { ok: false, error: `허용되지 않는 파일 형식입니다: ${file.name}` };
  }

  return { ok: true };
}

/** 여러 파일 일괄 검증 — 첫 실패 시 즉시 반환 */
export function validateFiles(files: File[]): FileValidationResult {
  for (const file of files) {
    const result = validateFile(file);
    if (!result.ok) return result;
  }
  return { ok: true };
}
