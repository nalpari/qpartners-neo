/**
 * 파일 업로드 검증 공통 유틸
 *
 * 콘텐츠 첨부파일 업로드/교체 시 공통으로 사용되는 검증 규칙.
 * - 파일 크기: 단일 파일 MAX_FILE_SIZE 제한 + 합계 정책은 라우트 측에서 별도 검증
 * - 확장자: PDF/Office/한글/텍스트/이미지/압축/미디어 화이트리스트
 *           (svg/html/htm/js — XSS, exe/bat/sh/ps1 등 — 실행, docm/xlsm/pptm — VBA 매크로 차단)
 * - MIME 타입: 확장자와 이중 검증 (image/* 와일드카드 금지 — svg+xml 우회 방지)
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** UI/에러 메시지 동적 표기용 — MAX_FILE_SIZE 변경 시 자동 반영. */
export const MAX_FILE_SIZE_MB = Math.floor(MAX_FILE_SIZE / (1024 * 1024));

/**
 * 허용 확장자 (소문자) — 화이트리스트 방식.
 * 차단 대상(SVG/HTML/JS/실행파일/매크로 포함 Office)은 의도적 제외:
 *   - svg/html/htm/js: stored XSS
 *   - exe/bat/cmd/sh/ps1/msi/dmg/app/jar: 실행 파일
 *   - docm/xlsm/pptm: VBA 매크로 실행 가능 Office
 *   - vbs/wsf/hta: Windows 스크립트
 */
export const ALLOWED_EXTENSIONS = new Set([
  // 문서 (Office 신/구버전 + 한글 + 일반 텍스트)
  "pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt",
  "txt", "csv", "md", "hwp", "hwpx",
  // 이미지 (svg 제외 — XSS)
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
  // 압축
  "zip", "rar", "7z",
  // 미디어
  "mp4", "mov", "mp3", "wav",
]);

/** 허용 MIME 타입 (문서/압축/미디어). 빈 MIME 은 확장자만으로 통과(별도 분기). */
export const ALLOWED_MIMES = [
  // 문서
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "text/markdown",
  // 한글 — 표준 MIME 없음(브라우저별로 빈 MIME 또는 application/x-hwp 전송)
  "application/x-hwp",
  "application/haansofthwp",
  // 압축
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  // 미디어
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
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
    return { ok: false, error: `ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています: ${file.name}` };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `許可されていないファイル拡張子です: ${file.name}` };
  }

  // MIME 검증
  // - 빈 MIME (file.type === ""): Windows 일부 환경에서 .docx/.xlsx/.pptx가 빈 MIME으로 전송됨 → 확장자만 신뢰
  //   리뷰 대응: 감사 로그용 경고 출력 (확장자 기반 통과지만 비정상 흐름으로 추적 가능하게 함).
  //   TODO(후속): magic-byte 기반 검사 도입 (별도 의존성 추가 필요로 이번 PR에서는 보류)
  // - 비어있지 않은 경우: 명시 화이트리스트만 통과 (svg+xml 우회 방지)
  const mime = file.type || "";
  if (!mime) {
    console.warn("[file-validation] 빈 MIME 수신 — 확장자 기반 통과:", {
      fileName: file.name,
      ext,
      size: file.size,
    });
  } else if (!ALLOWED_MIMES.includes(mime) && !ALLOWED_IMAGE_MIMES.has(mime)) {
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

/**
 * Legacy Office (OLE2 Compound Document) magic-byte 감지.
 * - 시그니처: `D0 CF 11 E0 A1 B1 1A E1` (97-2003 Word/Excel/PowerPoint)
 * - 매크로 유무는 OLE2 내부 stream 분석이 필요해 magic-byte 만으로는 판별 불가 →
 *   로깅 전용. 운영 추적/감사 로그용. 차단은 별도 정책 결정 필요.
 *
 * TODO(security): 압축(zip/rar/7z) 내부 파일 검사도 추후 도입 필요 (외부 라이브러리 필요).
 *   현재 50MB 정책으로 zip bomb 위험은 제한적이며, 다운로드 시 Content-Disposition: attachment
 *   강제로 직접 실행은 차단됨. 신뢰 도메인 다운로드 후 실행 위험은 별도 PR 검토.
 */
export async function detectLegacyOfficeFormat(file: File): Promise<boolean> {
  if (file.size < 8) return false;
  // Uint8Array 사용으로 Buffer(node) 의존성 제거 — Edge runtime 이전 가능성 확보.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return (
    head[0] === 0xd0 &&
    head[1] === 0xcf &&
    head[2] === 0x11 &&
    head[3] === 0xe0 &&
    head[4] === 0xa1 &&
    head[5] === 0xb1 &&
    head[6] === 0x1a &&
    head[7] === 0xe1
  );
}
