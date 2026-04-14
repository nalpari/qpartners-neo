// Design Ref: §2 — API 응답 타입 + 검색 파라미터 + 상태 라벨

/** GET /api/admin/mass-mails 응답의 각 목록 항목 */
export interface MassMailListItem {
  id: number;
  status: "draft" | "pending" | "sent";
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
export const STATUS_LABEL_MAP: Record<string, string> = {
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
  status: "draft" | "pending" | "sent";
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
    .map(([k]) => API_KEY_TO_TARGET[k])
    .filter(Boolean);

  return {
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
