import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 비밀번호 초기화 요청 ───
//
// Redmine #2156 — userTp 별 입력 정책 재정의:
//   STORE   : loginId + email 둘 다 필수 (서버에서 응답 email 평문과 사후 매칭으로 AND 검증)
//   SEKO    : email 만 필수 (sekoId 입력란 제거)
//   GENERAL : loginId 또는 email 중 하나 필수 (단일 입력값. 화면은 loginId 필드로 전송).
//             서버에서 dual-key 병렬 조회로 OR 매칭.

export const passwordResetRequestSchema = z.object({
  userTp: userTpSchema,
  // GENERAL 탭에서는 단일 입력값(ID 또는 Email)을 loginId 채널로 운반하므로 max/regex 로
  // 길이·형식을 보수적으로 제한. log injection / 외부 API 부하 1차 방어선
  // (Boston 재검증 HIGH #2, 2026-05-07).
  loginId: z
    .string()
    .trim()
    .max(100, "ログインIDは100文字以内で入力してください")
    .regex(/^[\w@.+\- ]+$/i, "ログインIDの形式が正しくありません")
    .optional(),
  // GENERAL 에서는 email 미전송 가능 → optional. STORE/SEKO 는 superRefine 으로 강제.
  email: z
    .string()
    .trim()
    .email("有効なメールアドレスを入力してください")
    .max(100)
    .optional(),
}).superRefine((data, ctx) => {
  if (data.userTp === "STORE") {
    if (!data.loginId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "販売店会員はID入力が必須です",
        path: ["loginId"],
      });
    }
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Eメールは必須です",
        path: ["email"],
      });
    }
  }
  if (data.userTp === "SEKO") {
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Eメールは必須です",
        path: ["email"],
      });
    }
  }
  if (data.userTp === "GENERAL") {
    if (!data.loginId && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IDまたはEメールを入力してください",
        path: ["loginId"],
      });
    }
  }
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
