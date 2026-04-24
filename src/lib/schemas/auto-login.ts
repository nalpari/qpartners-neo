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
