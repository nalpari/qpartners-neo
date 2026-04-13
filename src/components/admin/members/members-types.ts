// Design Ref: §2 — API Response 타입 + §5 레이블/날짜 포맷

/** 목록 아이템 (API 응답 기준) */
export interface MemberListItem {
  id: string;
  userId: string;
  userName: string;
  userNameKana: string;
  email: string;
  userType: string;
  companyName: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string | null;
}

/** 목록 응답 전체 */
export interface MemberListResponse {
  data: {
    totalCount: number;
    page: number;
    pageSize: number;
    list: MemberListItem[];
  };
}

/** 검색 필터 */
export interface MemberSearchFilters {
  keyword: string;
  userType: string;
  status: string;
}

/** 상태 레이블 (Plan §4.3) */
export const STATUS_LABEL_MAP: Record<string, string> = {
  active: "Active",
  deleted: "Delete",
  withdrawn: "退会済",
};

/** 상태 검색 필터 옵션 (Plan §4.1) */
export const STATUS_OPTIONS = [
  { value: "", label: "全体" },
  { value: "active", label: "Active" },
  { value: "deleted", label: "Delete" },
  { value: "withdrawn", label: "退会済" },
] as const;

/** 회원타입 검색 필터 옵션 (Plan §4.2) */
export const MEMBER_TYPE_OPTIONS = [
  { value: "", label: "全体" },
  { value: "ADMIN", label: "管理者" },
  { value: "STORE", label: "販売店" },
  { value: "GENERAL", label: "一般" },
] as const;

/** 날짜+시간 포맷 (ISO 8601 → YYYY.MM.DD HH:mm) */
export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

/** 날짜 포맷 (ISO 8601 → YYYY.MM.DD) */
export function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export const INITIAL_FILTERS: MemberSearchFilters = {
  keyword: "",
  userType: "",
  status: "",
};
