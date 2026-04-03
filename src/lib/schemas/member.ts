import { z } from "zod";

// ─── 회원 목록 쿼리 파라미터 ───

export const memberListQuerySchema = z.object({
  keyword: z.string().optional(),
  userType: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

// ─── 회원 수정 요청 ───

export const memberUpdateSchema = z.object({
  userRole: z.string().optional(),
  twoFactorEnabled: z.boolean().optional(),
  loginNotification: z.boolean().optional(),
  attributeChangeNotification: z.boolean().optional(),
  status: z.enum(["active", "deleted"]).optional(),
  newsRcptYn: z.enum(["Y", "N"]).optional(),
});

export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

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
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
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
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
});

export type QspMemberDetailResponse = z.infer<typeof qspMemberDetailResponseSchema>;

// ─── QSP 회원 수정 응답 (공용 구조) ───

export const qspUpdateResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
});

// ─── 회원 ID 파라미터 (userId=이메일 문자열) ───

export const memberIdParamSchema = z.string().min(1, "IDは必須です");
