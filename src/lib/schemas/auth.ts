import { z } from "zod";

import { userTpValues } from "@/lib/schemas/common";

// ─── QSP 로그인 요청 ───

export const loginRequestSchema = z.object({
  loginId: z.string().min(1, "로그인 ID는 필수입니다"),
  pwd: z.string().min(1, "비밀번호는 필수입니다"),
  userTp: z.enum(userTpValues).default("GENERAL"),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

// ─── QSP 로그인 응답 ───

export const qspLoginUserSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  userTp: z.string(),
  compCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  email: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  authCd: z.string().nullable(),
  storeLvl: z.string().nullable(),
  statCd: z.string().nullable(),
  secAuthYn: z.string().nullable(),
  secAuthDt: z.string().nullable(),
  loginFailCnt: z.number().nullable(),
  pwdInitYn: z.string().nullable(),
});

export type QspLoginUser = z.infer<typeof qspLoginUserSchema>;

export const qspLoginResponseSchema = z.object({
  code: z.number().nullable(),
  data: qspLoginUserSchema.nullable(),
  data2: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
});

export type QspLoginResponse = z.infer<typeof qspLoginResponseSchema>;

// ─── 클라이언트에 전달할 로그인 사용자 정보 ───

export const loginUserSchema = qspLoginUserSchema
  .pick({
    userId: true,
    userNm: true,
    userTp: true,
    compCd: true,
    compNm: true,
    email: true,
    deptNm: true,
    authCd: true,
    storeLvl: true,
    statCd: true,
  })
  .extend({
    twoFactorVerified: z.boolean(),
  });

export type LoginUser = z.infer<typeof loginUserSchema>;
