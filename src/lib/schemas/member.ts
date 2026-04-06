import { z } from "zod";

// ─── QSP statCd ↔ TO-BE status 매핑 (공용) ───

/** QSP statCd → TO-BE status */
export const STAT_CD_TO_STATUS = {
  Y: "active",
  N: "deleted",
  W: "withdrawn",
} as const;

export type QspStatCd = keyof typeof STAT_CD_TO_STATUS;
export type MemberStatus = (typeof STAT_CD_TO_STATUS)[QspStatCd];

/** 수정 가능한 상태값 (withdrawn は読み取り専用のため除外) */
export type WritableStatus = "active" | "deleted";

/** TO-BE status → QSP statCd (수정 가능한 상태만) */
export const STATUS_TO_STAT_CD: Record<WritableStatus, QspStatCd> = {
  active: "Y",
  deleted: "N",
};

/** 목록 필터용: withdrawn 포함 전체 매핑 */
export const STATUS_FILTER_TO_STAT_CD: Record<MemberStatus, QspStatCd> = {
  active: "Y",
  deleted: "N",
  withdrawn: "W",
};

/** QSP userTp → 화면표시 회원유형 레이블 */
export const USER_TYPE_LABEL = {
  ADMIN: "管理者",
  STORE: "販売店",
  GENERAL: "一般",
} as const;

/** 안전한 lookup (키가 존재하면 값 반환, 아니면 undefined) */
export function lookupStatCd(key: string | null): MemberStatus | undefined {
  if (key !== null && key in STAT_CD_TO_STATUS) {
    return STAT_CD_TO_STATUS[key as QspStatCd];
  }
  return undefined;
}

export function lookupUserTypeLabel(key: string | null): string | undefined {
  if (key !== null && key in USER_TYPE_LABEL) {
    return USER_TYPE_LABEL[key as keyof typeof USER_TYPE_LABEL];
  }
  return undefined;
}

// ─── 회원 목록 쿼리 파라미터 ───

/** 회원 목록 필터용 상태값 */
const memberStatusValues = ["active", "deleted", "withdrawn"] as const;
/** 회원 목록 필터용 유형값 (시공점 제외) */
const memberTypeValues = ["ADMIN", "STORE", "GENERAL"] as const;

export const memberListQuerySchema = z.object({
  keyword: z.string().optional(),
  userType: z.enum(memberTypeValues).optional(),
  status: z.enum(memberStatusValues).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

// ─── 회원 수정 요청 ───

/** 관리자가 일반회원에게 부여 가능한 권한 코드 (p.47 #3) */
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
  compNm: z.string().nullable(),
  statCd: z.string().nullable(),
  lastLoginDt: z.string().nullable(),
  regDt: z.string().nullable(),
});

export type QspMemberItem = z.infer<typeof qspMemberItemSchema>;

export const qspMemberListResponseSchema = z.object({
  data: z.object({
    list: z.array(qspMemberItemSchema),
    totalCount: z.number(),
  }).nullable(),
  result: qspResultSchema,
});

export type QspMemberListResponse = z.infer<typeof qspMemberListResponseSchema>;

// ─── QSP 회원 상세 응답 ───

const qspMemberDetailSchema = z.object({
  userId: z.string(),
  loginId: z.string().nullable().optional(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  email: z.string().nullable(),
  userTp: z.string().nullable(),
  authCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  compPostCd: z.string().nullable(),
  compAddr: z.string().nullable(),
  compTelNo: z.string().nullable(),
  compFaxNo: z.string().nullable(),
  corpNo: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  secAuthYn: z.enum(["Y", "N"]).nullable(),
  loginNotiYn: z.enum(["Y", "N"]).nullable(),
  attrChgNotiYn: z.enum(["Y", "N"]).nullable(),
  statCd: z.string().nullable(),
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
  newsRcptDt: z.string().nullable(),
  lastLoginDt: z.string().nullable(),
  wdrawDt: z.string().nullable(),
  wdrawRsn: z.string().nullable(),
  regDt: z.string().nullable(),
  updDt: z.string().nullable(),
  updBy: z.string().nullable(),
});

export type QspMemberDetail = z.infer<typeof qspMemberDetailSchema>;

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

export const memberIdParamSchema = z.string().min(1, "IDは必須です");
