/**
 * 파일 업로드 검증 공통 유틸
 *
 * 콘텐츠 첨부파일 업로드/교체 시 공통으로 사용되는 검증 규칙.
 * - 파일 크기: 50MB 제한
 * - 확장자: PDF/Office/이미지 화이트리스트 (SVG 제외 — XSS 위험)
 * - MIME 타입: 확장자와 이중 검증 (image/* 와일드카드 금지 — svg+xml 우회 방지)
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** 허용 확장자 (소문자) — SVG 제외 (XSS 위험) */
export const ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
]);

/** 허용 MIME 타입 (문서) */
export const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/**
 * 허용 이미지 MIME (명시 enumeration) — image/* 와일드카드 금지.
 * image/svg+xml은 의도적으로 제외 (스크립트 임베드 가능 → stored XSS 위험).
 */
export const ALLOWED_IMAGE_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 파일 하나의 검증. 크기/확장자/MIME 체크.
 * 실패 메시지는 사용자에게 그대로 노출되는 일본어 메시지.
 */
export function validateFile(file: File): FileValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `ファイルサイズが50MBを超えています: ${file.name}` };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `許可されていないファイル拡張子です: ${file.name}` };
  }

  // MIME 검증
  // - 빈 MIME (file.type === ""): Windows 일부 환경에서 .docx/.xlsx/.pptx가 빈 MIME으로 전송됨 → 확장자만 신뢰
  // - 비어있지 않은 경우: 명시 화이트리스트만 통과 (svg+xml 우회 방지)
  const mime = file.type || "";
  if (mime && !ALLOWED_MIMES.includes(mime) && !ALLOWED_IMAGE_MIMES.has(mime)) {
    return { ok: false, error: `許可されていないファイル形式です: ${file.name}` };
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
