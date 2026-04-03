import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 비밀번호 초기화 요청 ───

export const passwordResetRequestSchema = z.object({
  userTp: userTpSchema,
  loginId: z.string().trim().optional(),
  email: z.string().email("有効なメールアドレスを入力してください").max(100),
  sekoId: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.userTp === "STORE" && (!data.loginId || data.loginId.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "販売店会員はID入力が必須です",
      path: ["loginId"],
    });
  }
  // SEKO sekoId는 선택 — QSP는 이메일만으로도 시공점 조회 가능
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

// ─── 토큰 검증 ───

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1, "トークンは必須です"),
});

export type PasswordResetVerifyInput = z.infer<typeof passwordResetVerifySchema>;

// ─── 비밀번호 변경 확인 ───

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(1, "トークンは必須です"),
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください").max(100),
    confirmPassword: z.string().min(1, "パスワード確認は必須です"),
  })
  .refine((data) => validatePasswordPolicy(data.newPassword), {
    message:
      "パスワードは英大文字・英小文字・数字を組み合わせて8文字以上にしてください",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
