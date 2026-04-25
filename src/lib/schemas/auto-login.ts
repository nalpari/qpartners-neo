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
 * POST /api/auth/auto-login/encrypt 502 응답 코드.
 * route handler / OpenAPI / 클라이언트 타입이 모두 본 단일 정의를 공유.
 */
export const UPSTREAM_CODES = {
  TIMEOUT: "UPSTREAM_TIMEOUT",
  HTTP_ERROR: "UPSTREAM_HTTP_ERROR",
  RESPONSE_PARSE_FAIL: "UPSTREAM_RESPONSE_PARSE_FAIL",
  SCHEMA_MISMATCH: "UPSTREAM_SCHEMA_MISMATCH",
  RESULT_FAIL: "UPSTREAM_RESULT_FAIL",
  ASSEMBLY_FAIL: "UPSTREAM_ASSEMBLY_FAIL",
} as const;
export type UpstreamCode = (typeof UPSTREAM_CODES)[keyof typeof UPSTREAM_CODES];

/** z.enum 용 tuple (1개 이상 보장) */
const UPSTREAM_CODE_VALUES = Object.values(UPSTREAM_CODES) as [
  UpstreamCode,
  ...UpstreamCode[],
];

/** 200 응답 — 자동로그인 진입 URL 생성 성공 */
export const encryptResponseSchema = z.object({
  data: z.object({
    url: z.string().url(),
  }),
});
export type EncryptResponse = z.infer<typeof encryptResponseSchema>;

/**
 * 502 응답 — 외부 암호화 서버(QSP autoLoginEncryptData) 관련 에러.
 * code 가 있으면 502, 없으면 일반 에러 응답.
 */
export const encryptErrorSchema = z.object({
  error: z.string(),
  code: z.enum(UPSTREAM_CODE_VALUES).optional(),
});
export type EncryptErrorResponse = z.infer<typeof encryptErrorSchema>;
