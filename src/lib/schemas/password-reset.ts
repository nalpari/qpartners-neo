import { z } from "zod";

import { userTpSchema } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 비밀번호 초기화 요청 ───
//
// Redmine #2156 — userTp 별 입력 정책 재정의:
//   STORE   : loginId + email 둘 다 필수 (서버에서 응답 email 평문과 사후 매칭으로 AND 검증)
//   GENERAL : loginId 또는 email 중 하나 필수 (단일 입력값. 화면은 loginId 필드로 전송).
//             서버에서 dual-key 병렬 조회로 OR 매칭.
//
// ⚠️ **SEKO 는 이 경로를 쓰지 않는다.** 화면설계서 v1.4 p12 에서 시공점 비밀번호 초기화가
// 「이메일 링크 발송」에서 「시공ID 입력 → 즉시 비밀번호 설정」으로 **프로세스 자체가 교체**됐다
// (p11 의 시공점 패널이 "시공점 회원 비밀번호 초기화 프로세스 변경" 으로 폐기 표기됨).
// 이로써 #2156 의 SEKO 정책(email 만 필수)도 함께 대체된다. 시공점은 아래
// `sekoPasswordReset*` 스키마와 `/api/auth/password-reset/seko/*` 경로를 탄다.

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
    // 폐기된 경로로의 진입을 스키마에서 막는다. 남겨두면 화면이 바뀐 뒤에도 이 라우트로
    // 시공점 재설정이 성립해 「이메일 링크」와 「시공ID 즉시 초기화」 두 흐름이 공존한다.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "施工店会員はこの経路をご利用いただけません",
      path: ["userTp"],
    });
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

// ─── 시공점(SEKO) 비밀번호 초기화 — 화면설계서 v1.4 p12 ───
//
// 판매점·일반과 달리 **메일 링크를 거치지 않는다.** 시공ID 존재 확인 후 곧바로 비밀번호를
// 설정한다(p12: 「비밀번호 초기화」→ 비밀번호 설정 팝업 호출 → 저장). 따라서 토큰이 없고,
// 두 단계 모두 시공ID 를 그대로 식별자로 쓴다.
//
// ⚠️ 이 흐름에는 **소유 증명 단계가 없다** — 시공ID 를 아는 사람은 누구나 해당 계정의
// 비밀번호를 바꿀 수 있다. AS-IS 사양(화면설계서 v1.4 p12)이 그러하므로 그대로 구현하되,
// 라우트에서 rate limit 을 반드시 건다.

/**
 * 시공ID 문자셋 — 이메일 겸용(No.8 `email/check` 의 loginId 는 「メールまたは施工ID」)이라
 * `passwordResetRequestSchema.loginId` 와 같은 보수적 charset 을 쓴다.
 * log injection·외부 API 부하 1차 방어선.
 */
const sekoIdSchema = z
  .string()
  .trim()
  .min(1, "施工IDは必須です")
  .max(100, "施工IDは100文字以内で入力してください")
  .regex(/^[\w@.+\- ]+$/i, "施工IDの形式が正しくありません");

/** 1단계 — 입력한 시공ID 가 AS-IS DB 에 존재하는지 확인 (p12 ④). */
export const sekoPasswordResetCheckSchema = z.object({
  sekoId: sekoIdSchema,
});

export type SekoPasswordResetCheckInput = z.infer<typeof sekoPasswordResetCheckSchema>;

/** 2단계 — 신규 비밀번호 설정 (p12 ⑧ 저장). 검증 규칙은 confirm 경로와 동일. */
export const sekoPasswordResetSchema = z
  .object({
    sekoId: sekoIdSchema,
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

export type SekoPasswordResetInput = z.infer<typeof sekoPasswordResetSchema>;
