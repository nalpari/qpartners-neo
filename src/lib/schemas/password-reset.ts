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

// ─── 시공점(SEKO) 전용 비밀번호 초기화 ───
//
// 시공점만 흐름이 다르다 — **시공ID 단독 조회 → 즉시 비밀번호 설정** (2단계).
// 위 3개 스키마(request/verify/confirm)는 판매점·일반이 공유하므로 **건드리지 않고** 별도 정의한다.
// (시공점 분기를 위 스키마에 넣으면 전 유형 공유 경로에 회귀 위험이 그대로 전이된다.)
//
// 이메일 토큰 단계가 없는 이유는 AS-IS 제약이다 — 시공점은 커넥터 응답 어디에도 이메일 필드가
// 없어(No.8 email/check = {exists,userId}, No.7 getUserList 실측) 시공ID 로부터 수신 주소를
// 얻을 수 없다. 따라서 링크 발송 방식 자체가 성립하지 않는다.

/**
 * 시공ID. 형식이 AS-IS 측에서 확정되지 않아 `loginId` 와 동일한 보수적 제한만 건다
 * (log injection / 외부 API 부하 1차 방어선). 공백 허용 — 더미 데이터가 `ID SampleNum1` 형태다.
 */
const sekoIdSchema = z
  .string()
  .trim()
  .min(1, "施工IDは必須です")
  .max(100, "施工IDは100文字以内で入力してください")
  .regex(/^[\w@.+\- ]+$/i, "施工IDの形式が正しくありません");

/** 1단계 — 시공ID 존재 확인 */
export const sekoPasswordResetCheckSchema = z.object({
  sekoId: sekoIdSchema,
});

export type SekoPasswordResetCheckInput = z.infer<typeof sekoPasswordResetCheckSchema>;

/**
 * 2단계 — 신규 비밀번호 저장.
 *
 * 1단계 통과를 증명하는 토큰이 없다(즉시 팝업 방식). 따라서 이 스키마를 통과한 요청은
 * **그 자체로 비밀번호를 바꿀 수 있는 요청**이므로, 라우트가 반드시 rate limit 을 건다.
 * 비밀번호 정책은 위 `passwordResetConfirmSchema` 와 동일 기준을 재사용한다
 * (signup ↔ password-reset 의 min/max 불일치 금지 규칙).
 */
export const sekoPasswordResetConfirmSchema = z
  .object({
    sekoId: sekoIdSchema,
    // 길이·조합 위반을 전부 같은 문구로 접는다 — 조건 나열은 입력란 아래 안내문(※…)이 담당하고,
    // 에러는 형식 불일치만 알린다(화면 문구와 일치시켜 서버 우회 시에도 안내가 갈리지 않게 한다).
    newPassword: z
      .string()
      .min(8, "パスワードの形式が正しくありません")
      .max(100, "パスワードの形式が正しくありません"),
    confirmPassword: z.string().min(1, "パスワード確認は必須です"),
  })
  .refine((data) => validatePasswordPolicy(data.newPassword), {
    message: "パスワードの形式が正しくありません",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export type SekoPasswordResetConfirmInput = z.infer<typeof sekoPasswordResetConfirmSchema>;
