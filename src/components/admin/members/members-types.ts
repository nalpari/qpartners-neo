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

// ISO 문자열의 wall-clock을 직접 슬라이싱 — SSR/UTC 환경에서도 동일 결과 보장
// (new Date(iso).getDate() 는 로컬 타임존 의존이라 JST 오프셋 ISO가 UTC로 해석되면 하루 밀림)
const ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** 날짜+시간 포맷 (ISO 8601 → YYYY.MM.DD HH:mm, 타임존 무관) */
export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const m = ISO_DATETIME_RE.exec(value);
  if (!m) return "-";
  return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`;
}

/** 날짜 포맷 (ISO 8601 → YYYY.MM.DD, 타임존 무관) */
export function formatDate(value: string | null): string {
  if (!value) return "-";
  const m = ISO_DATE_RE.exec(value);
  if (!m) return "-";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export const INITIAL_FILTERS: MemberSearchFilters = {
  keyword: "",
  userType: "",
  status: "",
};

// ─── 상세/수정 (Design Ref: §2, §5) ───

/** 상세 조회 응답 */
export interface MemberDetail {
  id: string;
  userId: string;
  userName: string;
  userNameKana: string;
  firstName: string;
  lastName: string;
  firstNameKana: string;
  lastNameKana: string;
  email: string;
  userType: string;
  userRole: string;
  companyName: string;
  companyNameKana: string;
  zipcode: string;
  address: string;
  address2: string;
  telNo: string;
  faxNo: string;
  department: string;
  jobTitle: string;
  twoFactorEnabled: boolean | null;
  loginNotification: boolean;
  attributeChangeNotification: boolean;
  status: string;
  newsRcptYn: string;
  // 백엔드 추가 매핑 후 사용 (현재 미반환 시 undefined)
  createdAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  withdrawnAt?: string | null;
  withdrawReason?: string | null;
  newsRcptDate?: string | null;
  lastLoginAt?: string | null;
}

/** 수정 요청 body */
export interface MemberUpdatePayload {
  userRole?: string;
  twoFactorEnabled?: boolean;
  loginNotification?: boolean;
  attributeChangeNotification?: boolean;
  status?: string;
  newsRcptYn?: string;
}

/** userType 일본어 → userTp 영문 역매핑 */
export const USER_TYPE_REVERSE_MAP: Record<string, string> = {
  "管理者": "ADMIN",
  "販売店": "STORE",
  "施工店": "SEKO",
  "一般": "GENERAL",
};

/** 권한 SelectBox 옵션 (GENERAL만) */
export const ROLE_OPTIONS_GENERAL = [
  { value: "1ST_STORE", label: "1次販売店" },
  { value: "2ND_STORE", label: "2次以降販売店" },
  { value: "SEKO", label: "施工店" },
  { value: "GENERAL", label: "一般" },
] as const;

/** 권한 코드 → 표시 레이블 */
export const ROLE_LABEL_MAP: Record<string, string> = {
  ADMIN: "管理者",
  "1ST_STORE": "1次販売店",
  "2ND_STORE": "2次以降販売店",
  SEKO: "施工店",
  GENERAL: "一般",
};

/** API status → 표시 레이블 */
export const API_TO_STATUS: Record<string, string> = {
  active: "Active",
  deleted: "Delete",
  withdrawn: "退会済",
};
