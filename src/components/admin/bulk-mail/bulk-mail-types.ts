// Design Ref: §2 — API 응답 타입 + 검색 파라미터 + 상태 라벨

/** 메일 상태 */
export type MassMailStatus = "draft" | "pending" | "sent";

/** GET /api/admin/mass-mails 응답의 각 목록 항목 */
export interface MassMailListItem {
  id: number;
  status: MassMailStatus;
  targets: Record<string, boolean>;
  targetsLabel: string;
  subject: string;
  hasAttachment: boolean;
  senderName: string;
  senderId: string;
  sentAt: string | null;
  createdAt: string;
}

/** GET /api/admin/mass-mails 응답 전체 구조 */
export interface MassMailListResponse {
  data: {
    totalCount: number;
    page: number;
    pageSize: number;
    list: MassMailListItem[];
  };
}

/** 검색 파라미터 (BulkMailSearch → BulkMailContents → BulkMailTable) */
export interface MassMailSearchParams {
  keyword?: string;
  target?: string;
}

/** API status → UI 표시 매핑 */
export const STATUS_LABEL_MAP: Record<MassMailStatus, string> = {
  draft: "下書き",
  pending: "配信待ち",
  sent: "配信完了",
};

// ─── 상세/등록 관련 타입 (Design Ref: §2) ───

/** 첨부파일 메타데이터 (상세 API 응답) */
export interface MassMailAttachment {
  id: number;
  fileName: string;
  fileSize: number | null;
}

/** GET /api/admin/mass-mails/:id 상세 응답 */
export interface MassMailDetail {
  id: number;
  senderName: string;
  targets: Record<string, boolean>;
  targetsLabel: string;
  optOut: boolean;
  subject: string;
  body: string;
  status: MassMailStatus;
  sentAt: string | null;
  attachments: MassMailAttachment[];
  createdBy: string;
  createdAt: string;
}

export interface MassMailDetailResponse {
  data: MassMailDetail;
}

/** POST /api/admin/mass-mails 등록 응답 */
export interface MassMailCreateResponse {
  data: {
    id: number;
    status: string;
    message: string;
  };
}

/** 폼 모드 */
export type FormMode = "create" | "detail" | "edit" | "copy";

/** 폼 초기 데이터 */
export interface FormInitialData {
  /** edit 모드 시 기존 레코드 ID */
  id?: number;
  senderName: string;
  targets: string[];
  optOut: boolean;
  subject: string;
  body: string;
  sentAt: string | null;
  createdBy: string;
  createdAt: string;
  attachments: MassMailAttachment[];
}

/** UI 체크박스 value → API FormData boolean 필드 매핑 */
export const TARGET_TO_API_FIELD: Record<string, string> = {
  "super-admin": "targetSuperAdmin",
  "admin": "targetAdmin",
  "first-dealer": "targetFirstStore",
  "second-dealer": "targetSecondStore",
  "installer": "targetConstructor",
  "general": "targetGeneral",
};

/** API targets responseKey → UI 체크박스 value 역매핑 */
export const API_KEY_TO_TARGET: Record<string, string> = {
  super_admin: "super-admin",
  admin: "admin",
  first_store: "first-dealer",
  second_store: "second-dealer",
  seko: "installer",
  general: "general",
};

/** API 상세 응답 → 폼 초기 데이터 변환 */
export function toFormInitialData(detail: MassMailDetail): FormInitialData {
  const targets = Object.entries(detail.targets)
    .filter(([, v]) => v)
    .map(([k]) => {
      const mapped = API_KEY_TO_TARGET[k];
      if (!mapped) console.warn("[toFormInitialData] 알 수 없는 target key:", k);
      return mapped;
    })
    .filter(Boolean);

  return {
    id: detail.id,
    senderName: detail.senderName,
    targets,
    optOut: detail.optOut,
    subject: detail.subject,
    body: detail.body,
    sentAt: detail.sentAt,
    createdBy: detail.createdBy,
    createdAt: detail.createdAt,
    attachments: detail.attachments,
  };
}

/** ISO 날짜 → YYYY.MM.DD HH:mm 포맷 */
export function formatMailDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

/** FormData 구성 (등록 API 전송용) */
export function buildFormData(params: {
  senderName: string;
  targets: string[];
  optOut: boolean;
  subject: string;
  body: string;
  status: "draft" | "pending";
  files: File[];
}): FormData {
  const fd = new FormData();
  fd.append("senderName", params.senderName);
  fd.append("subject", params.subject);
  fd.append("body", params.body);
  fd.append("status", params.status);
  fd.append("optOut", String(params.optOut));

  for (const [uiValue, apiField] of Object.entries(TARGET_TO_API_FIELD)) {
    fd.append(apiField, String(params.targets.includes(uiValue)));
  }

  for (const file of params.files) {
    fd.append("files", file);
  }

  return fd;
}

/** FormData 전송용 axios config — 기본 Content-Type 헤더를 제거하여 multipart 자동 설정 */
export const FORM_DATA_CONFIG = {
  headers: { "Content-Type": undefined },
} as const;
