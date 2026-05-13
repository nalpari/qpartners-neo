// Design Ref: mass-mail.design.md §2 — API 응답 타입 + 검색 파라미터 + 상태 라벨
// (Target Dynamic from Role 후 — qp_roles 단일 출처)

// DB enum 단일 출처 — Prisma 가 schema.prisma 로부터 생성. 수동 string union 으로 중복 선언 시
// schema 가 바뀌어도 컴파일러가 잡지 못해 silent drift 발생. 타입 전용 import 라 런타임 영향 없음.
import type { MailStatus } from "@/generated/prisma/client";

// 사무국 서명 텍스트 단일 출처 — 시스템 메일과 동일 출처. drift 방지.
import { FOOTER_LINES } from "@/lib/mail-templates/footer";

/** 메일 상태 — Prisma MailStatus 와 단일 출처. sending/send_failed 는 자동 처리 / 운영자 화면 노출. */
export type MassMailStatus = MailStatus;

/** 失敗確認 모달용 — 실패 사유 카테고리 (SMTP 원문 노출 금지) */
export type FailureCategory =
  | "ORPHAN_SEND"
  | "SMTP_TIMEOUT"
  | "SMTP_REJECT"
  | "UNKNOWN";

/** 失敗확인 모달용 — 영구 실패 수신자 1건 */
export interface FailedRecipient {
  /** 마스킹된 이메일 (local-part 첫 1자만 노출) */
  email: string;
  userName: string | null;
  /** 발송 시점 권한 코드 스냅샷 — qp_roles FK 가 아닌 String (권한 비활성/삭제 후에도 이력 보존) */
  authRoleCode: string;
  errorCategory: FailureCategory;
  lastAttemptAt: string | null;
}

/** GET /api/admin/mass-mails 응답의 각 목록 항목 */
export interface MassMailListItem {
  id: number;
  status: MassMailStatus;
  /** 게시대상 권한코드 배열 — useTargetLabels 로 라벨링 */
  targetRoleCodes: string[];
  subject: string;
  hasAttachment: boolean;
  senderName: string;
  senderId: string;
  createdByName: string | null;
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
  /** 게시대상 권한코드 (단일 선택) — qp_roles 동적 (6 기본 + 추가 권한) */
  roleCode?: string;
  authorSearchType?: "name" | "id";
  authorQuery?: string;
  startDate?: string;
  endDate?: string;
}

/** API status → UI 표시 매핑 */
export const STATUS_LABEL_MAP: Record<MassMailStatus, string> = {
  draft: "下書き",
  pending: "配信待ち",
  sending: "配信中",
  sent: "配信完了",
  send_failed: "送信失敗",
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
  /** 게시대상 권한코드 배열 — useTargetLabels 로 라벨링 */
  targetRoleCodes: string[];
  optOut: boolean;
  subject: string;
  body: string;
  status: MassMailStatus;
  sentAt: string | null;
  /** 발송 대상 총 건수 (수집 완료 후 확정) */
  sentTotal: number;
  /** 발송 성공 건수 */
  sentSuccess: number;
  /** 발송 실패 건수 */
  sentFailed: number;
  /** 작성자 userType */
  userType: string;
  /** 작성자 userId */
  userId: string;
  /** 작성자가 SUPER_ADMIN 여부 — 프론트 수정/삭제 버튼 노출 판단용 */
  authorIsSuperAdmin: boolean;
  attachments: MassMailAttachment[];
  /** 영구 실패 수신자 (상한 500건). PII 보호: email 마스킹, errorMessage → errorCategory 치환. */
  failedRecipients: FailedRecipient[];
  /** 전체 영구 실패 건수 (응답 배열은 상한이 있으므로 별도 노출) */
  failedRecipientsTotal: number;
  /** true 면 실패 명단이 상한 초과로 잘림 — UI 에서 안내 필요 */
  failedRecipientsTruncated: boolean;
  createdBy: string;
  createdByName: string | null;
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

/**
 * 신규 작성 시 RichEditor 에 미리 채워지는 사무국 서명 HTML.
 *
 * 다른 시스템메일(signup-complete / inquiry-confirmation / password-reset / two-factor /
 * login / attr-change)이 공유하는 `MAIL_FOOTER_HTML`(`src/lib/mail-templates/footer.ts`)
 * 과 동일 텍스트(FOOTER_LINES 단일 출처)·스타일(font-size:11px / color:#999) 적용.
 *
 * 스타일은 `<span style>` 로 부여 — RichEditor 의 textStyle mark 와 호환되며,
 * sanitize-html.ts 의 SPAN_ALLOWED_STYLE_PROPS(color / font-size) 를 통과한다.
 *
 * 본문 자체에 서명이 들어가므로, BE 의 `buildMailHtml` 은 더 이상 풋터를 자동 부착하지 않는다.
 */
export const SIGNATURE_SPAN_STYLE = "font-size: 11px; color: #999";
export const DEFAULT_BULK_MAIL_BODY_HTML: string = [
  "<p></p>",
  ...FOOTER_LINES.map(
    (line) => `<p><span style="${SIGNATURE_SPAN_STYLE}">${line}</span></p>`,
  ),
].join("");

/** 폼 초기 데이터 */
export interface FormInitialData {
  /** edit 모드 시 기존 레코드 ID */
  id?: number;
  senderName: string;
  /** 선택된 권한코드 배열 — qp_roles 동적 */
  targetRoleCodes: string[];
  optOut: boolean;
  subject: string;
  body: string;
  sentAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  /** 작성자 userType (edit/detail 권한 판별용) */
  userType: string;
  /** 작성자 userId (edit/detail 권한 판별용) */
  userId: string;
  /** 작성자가 SUPER_ADMIN 여부 — 프론트 수정/삭제 버튼 노출 판단용 (MassMailDetail 에서 단일 출처로 전달) */
  authorIsSuperAdmin: boolean;
  attachments: MassMailAttachment[];
}

/** API 상세 응답 → 폼 초기 데이터 변환 */
export function toFormInitialData(detail: MassMailDetail): FormInitialData {
  return {
    id: detail.id,
    senderName: detail.senderName,
    targetRoleCodes: detail.targetRoleCodes,
    optOut: detail.optOut,
    subject: detail.subject,
    body: detail.body,
    sentAt: detail.sentAt,
    createdBy: detail.createdBy,
    createdByName: detail.createdByName,
    createdAt: detail.createdAt,
    userType: detail.userType,
    userId: detail.userId,
    authorIsSuperAdmin: detail.authorIsSuperAdmin,
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

/** FormData 구성 (등록/수정 API 전송용) — targetRoleCodes 는 JSON 배열 직렬화 */
export function buildFormData(params: {
  senderName: string;
  targetRoleCodes: string[];
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
  // BE massMailCreateSchema.targetRoleCodesField 가 JSON parse → fallback comma split 양쪽 지원.
  // JSON 직렬화 우선 — comma 가 포함된 권한코드(미래 예약문자) 안전.
  fd.append("targetRoleCodes", JSON.stringify(params.targetRoleCodes));

  for (const file of params.files) {
    fd.append("files", file);
  }

  return fd;
}

/** FormData 전송용 axios config — 기본 Content-Type 헤더를 제거하여 multipart 자동 설정 */
export const FORM_DATA_CONFIG = {
  headers: { "Content-Type": undefined },
} as const;
