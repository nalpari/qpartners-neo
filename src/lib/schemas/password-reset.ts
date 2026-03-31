import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 비밀번호 초기화 요청 ───

export const passwordResetRequestSchema = z.object({
  userTp: userTpSchema,
  loginId: z.string().optional(),
  email: z.string().email("유효한 이메일 주소를 입력해주세요"),
  sekoId: z.string().optional(),
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

// ─── 토큰 검증 ───

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1, "토큰은 필수입니다"),
});

export type PasswordResetVerifyInput = z.infer<typeof passwordResetVerifySchema>;

// ─── 비밀번호 변경 확인 ───

export const passwordResetConfirmSchema = z
  .object({
    token: z.string().min(1, "토큰은 필수입니다"),
    newPassword: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
    confirmPassword: z.string().min(1, "비밀번호 확인은 필수입니다"),
  })
  .refine((data) => validatePasswordPolicy(data.newPassword), {
    message:
      "비밀번호는 영문대문자, 영문소문자, 숫자를 조합하여 8자 이상이어야 합니다",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
