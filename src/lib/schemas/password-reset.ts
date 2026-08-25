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
// 입력 식별자는 **시공ID** 다(p12 ②·④). 로그인 화면(p10)은 「이메일 또는 시공ID」 겸용이지만
// 초기화는 시공ID 단독으로 규정돼 있다. 2단계가 호출할 No.10 `resetPwd` 는 시공ID 를 받지
// 못하므로(2026-08-24 preview 실측), **1단계가 시공ID → 로그인ID(이메일) 해석까지 끝낸다**
// (`sekoResolveLoginIdByUserId`). 화면은 시공ID, 커넥터에 나가는 값은 이메일이다.
//
// 판매점·일반과 달리 **메일 링크를 거치지 않는다.** 시공ID 존재 확인 후 곧바로 비밀번호를
// 설정한다(p12: 「비밀번호 초기화」→ 비밀번호 설정 팝업 호출 → 저장).
//
// ⚠️ 이 흐름에는 **소유 증명 단계가 없다** — 시공ID 를 아는 사람은 누구나 해당 계정의
// 비밀번호를 바꿀 수 있다. 화면설계서 v1.4 p12 가 「시공ID 확인 → 즉시 설정」으로 규정하고
// 고객이 그 위험을 확인·수용했으므로(2026-08-24) 사양대로 구현한다.
//
// **소유 증명을 넣을 수단 자체가 없다.** 시공점 회원에 등록된 이메일은 실제 사용하는 주소가
// 아니라 임의로 등록해 놓은 값인 경우가 있다(2026-08-25 설계 담당 확인). 1단계 해석으로
// 주소를 얻을 수는 있지만 본인 주소라는 보장이 없으므로, 메일 링크·OTP 를 보내도 소유 증명이
// 되지 않는다. p12 가 초기화를 시공ID 단독으로 규정한 이유도 이것이다.
//
// 대신 두 단계를 **서버 상태로 잇는다.** 1단계가 시공ID 에 바인딩된 단명 일회용 토큰을
// 발급하고 2단계는 그 토큰을 원자적으로 소비한 요청만 처리한다. 소유 증명은 아니지만,
// 2단계만 단독 호출해 비밀번호를 바꾸는 것(= 1단계를 건너뛰는 표적 단발 요청)은 막힌다.
// 계정 단위 한도(1시간 3회)도 여기서 성립한다 — IP 단위 한도만으로는 단일 계정을 겨눈
// 시도를 제한할 수 없다.

/**
 * 시공ID 문자셋 — charset 은 `passwordResetRequestSchema.loginId` 와 같은 보수적 기준을 쓴다
 * (log injection·외부 API 부하 1차 방어선). 다만 **`@` 는 허용하지 않는다.**
 *
 * ⚠️ **이메일 입력을 거부한다.** No.8 `email/check` 는 이메일도 시공ID 와 같은 계정으로
 * 해석하므로, 막지 않으면 1·2단계가 모두 통과한다 — 화면은 「施工ID」를 요구하는데 이메일이
 * 통과하는, 표기와 동작이 어긋난 상태가 된다. 화면설계서 v1.4 p12 ②·④ 가 이 경로의 입력을
 * 시공ID 로 규정하므로 스키마에서 잘라낸다.
 *
 * `@` 포함 여부만으로 판정한다 — 시공ID 에 `@` 가 들어갈 여지가 없고, 이메일 형식 전체를
 * 정규식으로 판정하려 들면 경계 사례에서 정상 시공ID 를 막을 위험이 있다.
 */
const sekoIdSchema = z
  .string()
  .trim()
  .min(1, "施工IDは必須です")
  .max(100, "施工IDは100文字以内で入力してください")
  .superRefine((value, ctx) => {
    // `@` 를 먼저 본다 — charset 위반으로 먼저 걸리면 「형식이 올바르지 않다」 로만 안내돼
    // 무엇을 고쳐야 하는지 전달되지 않는다.
    if (value.includes("@")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "メールアドレスではなく施工IDを入力してください",
      });
      return;
    }
    if (!/^[\w.+\- ]+$/i.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "施工IDの形式が正しくありません",
      });
    }
  });

/** 1단계 — 입력한 시공ID 가 AS-IS DB 에 존재하는지 확인 (p12 ④). */
export const sekoPasswordResetCheckSchema = z.object({
  sekoId: sekoIdSchema,
});

export type SekoPasswordResetCheckInput = z.infer<typeof sekoPasswordResetCheckSchema>;

/**
 * 2단계 — 신규 비밀번호 설정 (p12 ⑧ 저장). 검증 규칙은 confirm 경로와 동일.
 *
 * `resetToken` 은 1단계 응답으로 받은 원본 토큰이다. 서버는 이 토큰이 지목하는 시공ID 를
 * 재설정 대상으로 삼으므로, `sekoId` 는 **대조용**이지 대상 지정용이 아니다
 * (body 만 고쳐 다른 계정을 겨누는 경로를 만들지 않기 위함).
 */
export const sekoPasswordResetSchema = z
  .object({
    sekoId: sekoIdSchema,
    resetToken: z.string().min(1, "トークンは必須です"),
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
