// Design Ref: §2 — API Response 타입 + §5 — 레이블 매핑/유틸

/** 목록 아이템 (API 응답 기준) */
export interface NoticeListItem {
  id: number;
  targets: string[];
  title: string;
  content: string;
  url: string | null;
  startAt: string;
  endAt: string;
  status: string;
  userType: string;
  userId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** 목록 응답 전체 */
export interface NoticeListResponse {
  data: NoticeListItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/** 팝업 폼 데이터 (등록/수정용) */
export interface NoticeFormData {
  id?: number;
  targets: string[];
  startDate: string;
  endDate: string;
  title: string;
  content: string;
  url: string;
  author: string;
  authorId: string;
  createdAt: string;
  updater: string;
  updaterId: string;
  updatedAt: string;
}

/** 검색 필터 */
export interface NoticeSearchFilters {
  keyword: string;
  statuses: string[];
  targetType: string;
  startDate: Date | null;
  endDate: Date | null;
  author: string;
}

export const INITIAL_FILTERS: NoticeSearchFilters = {
  keyword: "",
  statuses: [],
  targetType: "",
  startDate: null,
  endDate: null,
  author: "",
};

/** 상태 레이블 */
export const STATUS_LABEL_MAP: Record<string, string> = {
  scheduled: "掲示予定",
  active: "掲示中",
  ended: "終了",
};

/** 게시대상 레이블 */
export const TARGET_LABEL_MAP: Record<string, string> = {
  super_admin: "スーパー管理者",
  admin: "管理者",
  first_store: "1次店",
  second_store: "2次店以下",
  seko: "施工店",
  general: "一般会員",
};

/** targets 배열 → 일본어 라벨 문자열 */
export function targetsToLabel(targets: string[]): string {
  if (!targets || targets.length === 0) return "-";
  return targets.map((t) => TARGET_LABEL_MAP[t] ?? t).join(", ");
}

// Design Ref: §2 — targets ↔ API boolean 필드 변환

/** targets key → API boolean 필드명 매핑 */
export const TARGET_FIELD_MAP: Record<string, string> = {
  super_admin: "targetSuperAdmin",
  admin: "targetAdmin",
  first_store: "targetFirstStore",
  second_store: "targetSecondStore",
  seko: "targetConstructor",
  general: "targetGeneral",
};

/** targets 배열 → API request body boolean 필드 변환 */
export function targetsToPayload(targets: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, field] of Object.entries(TARGET_FIELD_MAP)) {
    result[field] = targets.includes(key);
  }
  return result;
}

/** ISO 8601 → YYYY.MM.DD */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
