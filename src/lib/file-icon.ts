/**
 * 파일 확장자·MIME 타입 → 아이콘 경로 매핑 유틸.
 * 파일 종류별 아이콘 에셋은 `public/asset/images/contents/` 하위에 배치.
 */

const ICON_BASE = "/asset/images/contents";

/** 파일 유형 분류 — MIME / 확장자 공용 */
type FileIconKind = "pdf" | "excel" | "word" | "ppt" | "image" | "zip" | "default";

const ICON_SRC_MAP: Record<FileIconKind, string> = {
  pdf: `${ICON_BASE}/pdfIcon.svg`,
  excel: `${ICON_BASE}/excel_icon.svg`,
  word: `${ICON_BASE}/word_icon.svg`,
  ppt: `${ICON_BASE}/ppt_icon.svg`,
  image: `${ICON_BASE}/png_icon.svg`,
  zip: `${ICON_BASE}/zip_icon.svg`,
  // 알 수 없는 형식은 PDF 아이콘으로 폴백 (범용 파일 아이콘 에셋 추가 시 교체)
  default: `${ICON_BASE}/pdfIcon.svg`,
};

const EXT_TO_KIND: Record<string, FileIconKind> = {
  pdf: "pdf",
  xlsx: "excel",
  xls: "excel",
  csv: "excel",
  docx: "word",
  doc: "word",
  pptx: "ppt",
  ppt: "ppt",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  zip: "zip",
  rar: "zip",
  "7z": "zip",
};

/** 확장자 또는 fileName 으로 아이콘 종류 판정 */
function kindByExt(fileName: string): FileIconKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_KIND[ext] ?? "default";
}

/** MIME 타입으로 아이콘 종류 판정 — 일치하는 게 없으면 default */
function kindByMime(mimeType: string | null): FileIconKind {
  if (!mimeType) return "default";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv"
  ) return "excel";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) return "word";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.ms-powerpoint"
  ) return "ppt";
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/x-7z-compressed"
  ) return "zip";
  return "default";
}

/** fileName 확장자 기반 아이콘 경로 */
export function getFileIconByName(fileName: string): string {
  return ICON_SRC_MAP[kindByExt(fileName)];
}

/**
 * MIME 타입 기반 아이콘 경로.
 * MIME 이 null/unknown 이면 `fileName` 확장자로 fallback (지정 시).
 */
export function getFileIconByMime(mimeType: string | null, fileName?: string): string {
  const kind = kindByMime(mimeType);
  if (kind !== "default") return ICON_SRC_MAP[kind];
  if (fileName) return ICON_SRC_MAP[kindByExt(fileName)];
  return ICON_SRC_MAP.default;
}
