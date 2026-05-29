/**
 * 파일 업로드 검증 공통 유틸
 *
 * 콘텐츠/메일 첨부파일 업로드/교체 시 공통으로 사용되는 검증 규칙.
 * - 파일 크기: 단일 파일 MAX_FILE_SIZE 제한 + 합계 정책은 라우트 측에서 별도 검증
 * - 확장자/MIME: policy 별 화이트리스트 (`contents` 확장 / `mail` 좁은 기본)
 * - MIME 타입: 확장자와 이중 검증 (image/* 와일드카드 금지 — svg+xml 우회 방지)
 *
 * 차단 정책 (의도적 제외 — 화이트리스트 외 확장자 추가 시에도 보안 위협 확장자 절대 금지):
 *   - svg/html/htm/js: stored XSS
 *   - exe/bat/cmd/sh/ps1/msi/dmg/app/jar: 실행 파일
 *   - docm/xlsm/pptm: VBA 매크로 실행 가능 Office (OOXML 기반)
 *   - vbs/wsf/hta: Windows 스크립트
 *
 * NOTE(security): Legacy Office (doc/xls/ppt) — OLE2 매크로 실행 위험.
 *   contents 정책은 doc/xls/ppt 를, mail 정책은 xls/ppt 를 허용한다
 *   (doc 은 외부 수신자 대상 운영 요구가 없어 mail 제외). 두 정책 모두 업로드 시
 *   isLegacyOfficeOLE2 head 검사로 감사 로깅하여 추적한다 (차단 X — 매크로 유무는 stream 분석 필요).
 *   운영 정책 검토 후 차단 격상(MIME 매칭 거부) 또는 화이트리스트 제거 결정 가능 — [PR #222 보안 리뷰 후속].
 *
 * TODO(security): md(text/markdown) — 마크다운 렌더러 도입 시 stored XSS 경로.
 *   현재는 다운로드 시 Content-Disposition: attachment + X-Content-Type-Options: nosniff 로
 *   즉시 위험 차단. **인라인 미리보기 기능 추가 시 md 파일은 렌더링 대상 제외 필수** —
 *   [PR #222 보안 리뷰 후속].
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** UI/에러 메시지 동적 표기용 — MAX_FILE_SIZE 변경 시 자동 반영. */
export const MAX_FILE_SIZE_MB = Math.floor(MAX_FILE_SIZE / (1024 * 1024));

/**
 * 콘텐츠 게시 첨부 허용 확장자 (소문자) — 확장된 화이트리스트.
 * Office 신/구버전 + 한글 + 일반 텍스트/마크다운 + 이미지 + 압축 + 미디어.
 */
export const ALLOWED_EXTENSIONS_CONTENTS = new Set([
  "pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt",
  "txt", "csv", "md", "hwp", "hwpx",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
  "zip", "rar", "7z",
  "mp4", "mov", "mp3", "wav",
]);

/**
 * 메일 첨부 허용 확장자 (소문자) — 좁은 기본 정책.
 * 대량메일 수신자 보호를 위해 콘텐츠 정책보다 엄격하게 제한:
 *   - 동영상(mp4/mov)/음성(mp3/wav): 대용량·스트리밍 포맷으로 메일 첨부 부적합
 *   - 압축(zip/rar/7z): 수신자가 풀어 실행할 위험 — 내부 검증 미도입 상태
 *   - 한글(hwp/hwpx): 외부 수신자 환경 호환성 낮음 + MIME 위조 가능
 *   - 텍스트(csv/md): 의도적 제외. csv 는 Excel CSV Injection 우려, md 는 외부 수신자에게
 *     일반적이지 않은 첨부 형태로 운영 요구사항 미확인 (필요 시 운영팀 합의 후 추가).
 *
 * 허용 추가(운영 요청, 2026-05-29):
 *   - txt: plain text, 실행/스크립트 위험 없음
 *   - 구버전 Office xls/ppt: OLE2 매크로 위험은 라우트의 isLegacyOfficeOLE2 감사 로깅으로 추적
 *
 * 변경 시 mass-mails 운영 요구사항 검토 + 수신자 보안 영향 평가 필요.
 */
export const ALLOWED_EXTENSIONS_MAIL = new Set([
  "pdf", "docx", "xlsx", "xls", "pptx", "ppt",
  "txt",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
]);

/** 기존 호환 — 명시되지 않은 호출은 콘텐츠 정책으로 폴백. */
export const ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS_CONTENTS;

/** 콘텐츠 정책 허용 MIME (문서/한글/압축/미디어). 빈 MIME 은 확장자만으로 통과(별도 분기). */
export const ALLOWED_MIMES_CONTENTS = [
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

/** 메일 정책 허용 MIME — 문서 OOXML + 구버전 Office(xls/ppt) + PDF + plain text */
export const ALLOWED_MIMES_MAIL = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/plain",
];

/** 기존 호환 — 명시되지 않은 호출은 콘텐츠 정책으로 폴백. */
export const ALLOWED_MIMES = ALLOWED_MIMES_CONTENTS;

/**
 * 허용 이미지 MIME (명시 enumeration) — image/* 와일드카드 금지.
 * image/svg+xml은 의도적으로 제외 (스크립트 임베드 가능 → stored XSS 위험).
 * policy 무관 공통 (이미지는 두 정책 모두 허용).
 */
export const ALLOWED_IMAGE_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

/** 업로드 정책 — 콘텐츠 게시 첨부 / 메일 첨부 구분. */
export type UploadPolicy = "contents" | "mail";

const POLICY_MAP: Record<UploadPolicy, { exts: Set<string>; mimes: string[] }> = {
  contents: { exts: ALLOWED_EXTENSIONS_CONTENTS, mimes: ALLOWED_MIMES_CONTENTS },
  mail: { exts: ALLOWED_EXTENSIONS_MAIL, mimes: ALLOWED_MIMES_MAIL },
};

export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 파일 하나의 검증. 크기/확장자/MIME 체크.
 * 실패 메시지는 사용자에게 그대로 노출되는 일본어 메시지.
 * @param policy 업로드 컨텍스트 (`contents` 기본, `mail` 명시 시 좁은 정책)
 */
export function validateFile(file: File, policy: UploadPolicy = "contents"): FileValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `ファイルサイズが${MAX_FILE_SIZE_MB}MBを超えています: ${file.name}` };
  }

  const { exts, mimes } = POLICY_MAP[policy];

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!exts.has(ext)) {
    // policy 별 에러 메시지 분리 — 메일은 더 좁은 정책이므로 사용자에게 컨텍스트 명시.
    const message = policy === "mail"
      ? `メール添付に許可されていないファイル拡張子です: ${file.name}`
      : `許可されていないファイル拡張子です: ${file.name}`;
    return { ok: false, error: message };
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
      policy,
    });
  } else if (!mimes.includes(mime) && !ALLOWED_IMAGE_MIMES.has(mime)) {
    return { ok: false, error: `許可されていないファイル形式です: ${file.name}` };
  }

  return { ok: true };
}

/** 여러 파일 일괄 검증 — 첫 실패 시 즉시 반환 */
export function validateFiles(files: File[], policy: UploadPolicy = "contents"): FileValidationResult {
  for (const file of files) {
    const result = validateFile(file, policy);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * Legacy Office (OLE2 Compound Document) magic-byte 시그니처 검증.
 * - 시그니처: `D0 CF 11 E0 A1 B1 1A E1` (97-2003 Word/Excel/PowerPoint)
 * - 매크로 유무는 OLE2 내부 stream 분석이 필요해 magic-byte 만으로는 판별 불가 →
 *   로깅 전용. 운영 추적/감사 로그용. 차단은 별도 정책 결정 필요.
 *
 * 미리 read 된 head 바이트(최소 8 바이트)를 받아 동기 검증한다.
 * 라우트에서 disk write 용 전체 buffer 를 read 할 때 같은 buffer 의 처음 8 바이트를 넘기면
 * 중복 arrayBuffer 호출 없이 검증 가능.
 *
 * TODO(security): 압축(zip/rar/7z) 내부 파일 검사도 추후 도입 필요 (외부 라이브러리 필요).
 *   현재 50MB 정책으로 zip bomb 위험은 제한적이며, 다운로드 시 Content-Disposition: attachment
 *   + X-Content-Type-Options: nosniff 로 직접 실행은 차단됨. 신뢰 도메인 다운로드 후 실행
 *   위험은 별도 PR 검토.
 */
export function isLegacyOfficeOLE2(head: Uint8Array): boolean {
  if (head.length < 8) return false;
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

/**
 * 파일 객체에서 첫 8바이트를 read 해 OLE2 여부 판정 (편의 비동기 헬퍼).
 * disk write 가 별도 단계에서 일어나 buffer 재사용이 어려운 경우 사용한다.
 * disk write 와 단일 read 로 통합 가능하다면 `isLegacyOfficeOLE2` 직접 사용 권장.
 */
export async function detectLegacyOfficeFormat(file: File): Promise<boolean> {
  if (file.size < 8) return false;
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return isLegacyOfficeOLE2(head);
}
