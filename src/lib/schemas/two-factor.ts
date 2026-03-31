import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";

// ─── 2차 인증 발송/재전송 ───

export const twoFactorSendSchema = z.object({
  userTp: userTpSchema,
  userId: z.string().min(1, "사용자 ID는 필수입니다"),
});

export type TwoFactorSendInput = z.infer<typeof twoFactorSendSchema>;

// ─── 2차 인증 검증 ───

export const twoFactorVerifySchema = z.object({
  userTp: userTpSchema,
  userId: z.string().min(1, "사용자 ID는 필수입니다"),
  code: z
    .string()
    .length(6, "인증번호는 6자리입니다")
    .regex(/^\d+$/, "숫자만 입력 가능합니다"),
});

export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
