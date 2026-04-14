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
