import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";

// ─── 2차 인증 발송/재전송 ───

export const twoFactorSendSchema = z.object({
  userTp: userTpSchema,
  userId: z.string().min(1, "ユーザーIDは必須です"),
});

export type TwoFactorSendInput = z.infer<typeof twoFactorSendSchema>;

// ─── 2차 인증 검증 ───

export const twoFactorVerifySchema = z.object({
  userTp: userTpSchema,
  userId: z.string().min(1, "ユーザーIDは必須です"),
  code: z
    .string()
    .length(6, "認証番号は6桁です")
    .regex(/^\d+$/, "数字のみ入力可能です"),
});

export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
