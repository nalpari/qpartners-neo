/**
 * 자동로그인(HANASYS / Q.Order / Q.Musubi) 공용 스키마·타입
 *
 * 서버 route handler와 클라이언트(header 드롭다운)가 동일 출처를 공유해
 * target 값 drift 를 방지한다. `.claude/rules/api.md` "중복 정의 금지" 규칙 준수.
 */

import { z } from "zod";

export const AUTO_LOGIN_TARGETS = ["qOrder", "qMusubi", "hanasys"] as const;
export type AutoLoginTarget = (typeof AUTO_LOGIN_TARGETS)[number];

export const autoLoginTargetSchema = z.enum(AUTO_LOGIN_TARGETS);

/** POST /api/auth/auto-login/encrypt 요청 바디 */
export const encryptRequestSchema = z.object({
  target: autoLoginTargetSchema,
});
export type EncryptRequest = z.infer<typeof encryptRequestSchema>;

/**
 * 200 응답 — 자동로그인 진입 URL 생성 성공.
 *
 * Q.Partners route handler 가 **프론트(클라이언트)에 반환**하는 응답 스키마.
 * 2026-04-27 부로 cipher 는 Q.Partners 자체 AES-128-CBC 암호화로 발급 (QSP 의존성 제거).
 */
export const encryptResponseSchema = z.object({
  data: z.object({
    url: z.string().url(),
  }),
});
export type EncryptResponse = z.infer<typeof encryptResponseSchema>;

/**
 * 에러 응답 — 자체 암호화·URL 조립 실패 등 서버 에러.
 *
 * 자체 암호화로 전환된 후 외부 게이트웨이 호출이 없어 502 코드 체계는 폐기됨.
 * 모든 에러는 4xx(요청 형식) / 5xx(서버) 로 분류되며 본 스키마는 메시지만 노출.
 */
export const encryptErrorSchema = z.object({
  error: z.string(),
});
export type EncryptErrorResponse = z.infer<typeof encryptErrorSchema>;
