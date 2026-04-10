import { z } from "zod";

// ─── QSP statCd ↔ TO-BE status 매핑 (공용) ───

/** QSP statCd → TO-BE status (사양서 기준: A=정상, D=삭제, R=탈퇴) */
export const STAT_CD_TO_STATUS = {
  A: "active",
  D: "deleted",
  R: "withdrawn",
} as const;

export type QspStatCd = keyof typeof STAT_CD_TO_STATUS;
export type MemberStatus = (typeof STAT_CD_TO_STATUS)[QspStatCd];

/** 수정 가능한 상태값 (withdrawn は読み取り専用のため除外) */
export type WritableStatus = "active" | "deleted";

/** TO-BE status → QSP statCd (수정 가능한 상태만) */
export const STATUS_TO_STAT_CD: Record<WritableStatus, QspStatCd> = {
  active: "A",
  deleted: "D",
};

/** 목록 필터용: withdrawn 포함 전체 매핑 */
export const STATUS_FILTER_TO_STAT_CD: Record<MemberStatus, QspStatCd> = {
  active: "A",
  deleted: "D",
  withdrawn: "R",
};

/** QSP userTp → 화면표시 회원유형 레이블
 *  MF-3: 관리자 회원관리 화면에서는 시공점(SEKO)을 관리 대상에서 제외하지만,
 *  QSP 응답에 SEKO 가 포함되어 상세/목록에 노출되는 경우를 대비해 레이블을 정의해 둔다.
 *  (미정의 시 "unknown" 으로 표시되어 운영상 추적이 어려움)
 */
export const USER_TYPE_LABEL = {
  ADMIN: "管理者",
  STORE: "販売店",
  SEKO: "施工店",
  GENERAL: "一般",
} as const;

/** 안전한 lookup — `as` 캐스팅 없이 타입 가드로 좁혀서 매핑 객체에 접근 */
function isQspStatCd(key: string): key is QspStatCd {
  return key in STAT_CD_TO_STATUS;
}

export function lookupStatCd(key: string | null): MemberStatus | undefined {
  if (key === null) return undefined;
  if (!isQspStatCd(key)) {
    console.warn("[lookupStatCd] 매핑되지 않는 statCd:", key);
    return undefined;
  }
  return STAT_CD_TO_STATUS[key];
}

type UserTypeKey = keyof typeof USER_TYPE_LABEL;
function isUserTypeKey(key: string): key is UserTypeKey {
  return key in USER_TYPE_LABEL;
}

export function lookupUserTypeLabel(key: string | null): string | undefined {
  if (key === null) return undefined;
  if (!isUserTypeKey(key)) {
    console.warn("[lookupUserTypeLabel] 매핑되지 않는 userTp:", key);
    return undefined;
  }
  return USER_TYPE_LABEL[key];
}

// ─── 회원 목록 쿼리 파라미터 ───

/** 회원 목록 필터용 상태값 */
const memberStatusValues = ["active", "deleted", "withdrawn"] as const;
/** 회원 목록 필터용 유형값
 *  시공점(SEKO)은 별도 관리 화면에서 다루므로 본 관리자 회원관리 필터에서는 의도적으로 제외.
 *  (표시 레이블은 USER_TYPE_LABEL 에 SEKO 를 포함하여 방어적으로 대응)
 */
const memberTypeValues = ["ADMIN", "STORE", "GENERAL"] as const;

export const memberListQuerySchema = z.object({
  // 길이 제한: QSP DoS 방지 (긴 문자열로 외부 API 부하 방지)
  keyword: z.string().max(200, "検索語が長すぎます").optional(),
  userType: z.enum(memberTypeValues).optional(),
  status: z.enum(memberStatusValues).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

// ─── 회원 수정 요청 ───

/** 관리자가 일반회원에게 부여 가능한 권한 코드 (p.47 #3)
 *  주의: 여기서의 SEKO 는 `authCd`(권한코드) 값이며, 위 `memberTypeValues` 의
 *  `userTp`(회원유형)와는 다른 개념이다. 즉 일반회원(userTp=GENERAL)에게
 *  시공점 권한(authCd=SEKO)을 부여할 수 있다는 의미로, userTp 가 SEKO 로
 *  바뀌는 것은 아니다.
 */
const assignableRoleValues = ["1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"] as const;

export const memberUpdateSchema = z.object({
  userRole: z.enum(assignableRoleValues).optional(),
  twoFactorEnabled: z.boolean().optional(),
  loginNotification: z.boolean().optional(),
  attributeChangeNotification: z.boolean().optional(),
  status: z.enum(["active", "deleted"]).optional(),
  newsRcptYn: z.enum(["Y", "N"]).optional(),
});

export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

// ─── QSP 공용 응답 구조 ───

const qspResultSchema = z.object({
  code: z.number(),
  resultCode: z.string(),
  message: z.string(),
  resultMsg: z.string(),
});

// ─── QSP 회원 목록 응답 ───

const qspMemberItemSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  email: z.string().nullable(),
  userTp: z.string().nullable(),
  userTpNm: z.string().nullable(),
  compNm: z.string().nullable(),
  statCd: z.string().nullable(),
  statNm: z.string().nullable(),
  loginDt: z.string().nullable(),
  regDt: z.string().nullable(),
});

export type QspMemberItem = z.infer<typeof qspMemberItemSchema>;

export const qspMemberListResponseSchema = z.object({
  data: z.object({
    totCnt: z.number().nullable().transform(v => v ?? 0),
    list: z.array(qspMemberItemSchema).nullable(),
  }).nullable(),
  result: qspResultSchema,
});

export type QspMemberListResponse = z.infer<typeof qspMemberListResponseSchema>;

// ─── QSP 회원 상세 응답 ───

/** QSP 유저 정보 조회 응답 (사양서 No.13 userDetail — /api/qpartners/user/detail) */
const qspMemberDetailSchema = z.object({
  userId: z.string(),
  userTp: z.string().nullable(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  user1stNm: z.string().nullable(),
  user2ndNm: z.string().nullable(),
  user1stNmKana: z.string().nullable(),
  user2ndNmKana: z.string().nullable(),
  email: z.string().nullable(),
  authCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  compPostCd: z.string().nullable(),
  compAddr: z.string().nullable(),
  compAddr2: z.string().nullable(),
  compTelNo: z.string().nullable(),
  compFaxNo: z.string().nullable(),
  compCd: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  statCd: z.string().nullable(),
  secAuthYn: z.enum(["Y", "N"]).nullable(),
  loginNotiYn: z.enum(["Y", "N"]).nullable(),
  attrChgYn: z.enum(["Y", "N"]).nullable(),
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
  pwdChgDt: z.string().nullable(),
  pwdInitYn: z.string().nullable(),
  storeLvl: z.string().nullable(),
});

export const qspMemberDetailResponseSchema = z.object({
  data: qspMemberDetailSchema.nullable(),
  result: qspResultSchema,
});

export type QspMemberDetailResponse = z.infer<typeof qspMemberDetailResponseSchema>;

// ─── QSP 회원 수정 응답 (공용 구조) ───

export const qspUpdateResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: qspResultSchema,
});

// ─── 회원 ID 파라미터 (userId=이메일 문자열) ───

// 길이 제한: DB VarChar(255) 초과로 인한 truncation/에러 방지
export const memberIdParamSchema = z
  .string()
  .min(1, "IDは必須です")
  .max(255, "IDが長すぎます");
