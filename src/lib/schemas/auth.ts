import { z } from "zod";

import { userTpValues, authRoleValues } from "@/lib/schemas/common";

// ─── QSP 로그인 요청 ───

export const loginRequestSchema = z.object({
  loginId: z.string().min(1, "ログインIDは必須です"),
  pwd: z.string().min(1, "パスワードは必須です"),
  userTp: z.enum(userTpValues).default("GENERAL"),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

// ─── QSP 로그인 응답 ───

export const qspLoginUserSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  // QSP 외부 시스템이므로 미지의 userTp 대비 — DEALER→STORE 과도기 호환 + 미지 값은 파싱 실패
  userTp: z.string().transform((val, ctx) => {
    // QSP 과도기: DEALER → STORE 호환 매핑
    if (val === "DEALER") return "STORE" as const;
    const parsed = z.enum(userTpValues).safeParse(val);
    if (parsed.success) return parsed.data;
    // unknown userTp → 파싱 실패 (caller에서 502 반환, GENERAL 폴백으로 잘못된 권한 부여 방지)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown userTp: ${val}` });
    return z.NEVER;
  }).pipe(z.enum(userTpValues)),
  compCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  // QSP 응답에서 필드 자체가 omit될 수 있어 nullish 사용 (다른 형제 필드와 다름)
  compTelNo: z.string().nullish(),
  email: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  authCd: z.string().nullable(),
  storeLvl: z.string().nullable(),
  statCd: z.string().nullable(),
  secAuthYn: z.enum(["Y", "N"]).nullable(),
  secAuthDt: z.string().nullable(),
  loginFailCnt: z.number().nullable(),
  pwdInitYn: z.enum(["Y", "N"]).nullable(),
  // QSP 가입일 ("YYYY.MM.DD" 또는 "YYYY.MM.DD HH:mm:ss"). 로그인 응답에서 누락될 수 있으므로
  // nullish. 2FA 유예기간(신규가입 후 validityDays) 판정에 사용 — 누락 시 유예 스킵 후
  // secAuthDt 기반 판정으로 폴백.
  regDt: z.string().nullish(),
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
    // optional: 배포 전 발급된 JWT(authRole 없음)와의 호환성 유지
    // TODO: 과도기 제거 — 전체 사용자 재로그인 후 optional 제거하고 required로 전환
    authRole: z.enum(authRoleValues).optional(),
    twoFactorVerified: z.boolean(),
    pwdInitYn: z.enum(["Y", "N"]).nullable().optional(),
    // 전화번호 — 현재는 QSP compTelNo(회사 전화번호) 단일 매핑
    // nullish: 기존 JWT 호환 (undefined, 재로그인 전까지) + QSP 응답 null 허용
    // TODO: SEKO 사용자는 개인 전화번호(telNo) 별도 처리 필요
    telNo: z.string().nullish(),
  });

export type LoginUser = z.infer<typeof loginUserSchema>;
