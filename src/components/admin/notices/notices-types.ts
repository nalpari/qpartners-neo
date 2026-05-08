// Design Ref: §2 — API Response 타입 + §5 — 레이블 매핑/유틸 (Target Dynamic from Role 후)

/** 목록 아이템 (API 응답 기준) */
export interface NoticeListItem {
  id: number;
  /** 게시대상 권한코드 배열 — qp_roles 동적 (6 기본 + 추가 권한) */
  targetRoleCodes: string[];
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
  /** QSP userDetail 조회 결과 — 미해결/실패 시 null. 표시는 "이름(ID)" 형식. */
  createdByName: string | null;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
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
  /** 게시대상 권한코드 배열 — qp_roles 동적 */
  targetRoleCodes: string[];
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
  /** 게시대상 권한코드 멀티 선택 (OR 조건). 비어있으면 전체. */
  roleCodes: string[];
  startDate: Date | null;
  endDate: Date | null;
  author: string;
}

export const INITIAL_FILTERS: NoticeSearchFilters = {
  keyword: "",
  statuses: [],
  roleCodes: [],
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

/**
 * roleCodes 배열 → 일본어 라벨 문자열.
 * resolveLabel 은 useTargetLabels().resolveLabel — 동적 권한관리 라벨/비활성 권한 표시 단일 출처.
 */
export function targetsToLabel(
  roleCodes: string[],
  resolveLabel: (roleCode: string | null) => string,
): string {
  if (!roleCodes || roleCodes.length === 0) return "-";
  return roleCodes.map((code) => resolveLabel(code)).join(", ");
}

/**
 * 등록자/갱신자 표시 헬퍼 — 그리드·팝업 공용.
 * - 이름·ID 둘 다 있음: `이름(ID)`
 * - ID 만 있음: `ID`
 * - 모두 없음: `-`
 *
 * 그리드(formatUserLabel) 와 팝업이 같은 폴백 정책을 쓰도록 단일 정의 유지.
 */
export function formatUserLabel(
  name: string | null | undefined,
  userId: string | null | undefined,
): string {
  if (!userId) return "-";
  if (name && name.trim()) return `${name}(${userId})`;
  return userId;
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
