import { z } from "zod";

/**
 * AS-IS Q.Partners(시공점/SEKO) Connector API 응답 스키마.
 *
 * 사양서: `(AS-IS)Q.Partners.Connector.API 인터페이스 사양서_20260731.xlsx`.
 * ⚠️ 스키마는 **실물 응답 기준** (2026-08-07 preview 스모크 확인) — 사양서 예시와 아래가 다르다:
 *   - result 메시지 필드명: 사양서 `resultMsg` → 실제 **`resultMessage`**
 *   - `errorCode`: 오류 응답(resultCode="E")에만 포함, 성공 시 미출력 → optional
 *   - `groupKind`: 사양서 예시는 문자열 "20", 실제는 int 30 → coerce 로 양쪽 수용
 *
 * 본 파일은 커넥터 기반(공통 result + No.2 Login)을 정의한다.
 * 나머지 API 응답 스키마는 각 I/F 브랜치에서 추가된다.
 */

/** SEKO Connector 공용 응답 result 구조 */
export const sekoResultSchema = z.object({
  code: z.number(),
  message: z.string(),
  resultCode: z.string(),
  resultMessage: z.string(),
  errorCode: z.string().optional(),
});

export type SekoResult = z.infer<typeof sekoResultSchema>;

// ─── No.2 Seko Login API (/api/seko/login) ───

const sekoLoginDataSchema = z.object({
  token: z.string(),
  expiredAt: z.string(),
  userId: z.string(),
  loginId: z.string(),
  sei: z.string(),
  mei: z.string(),
  seiKana: z.string().nullable(),
  meiKana: z.string().nullable(),
  email: z.string().nullable(),
  telNo: z.string().nullable(),
  fax: z.string().nullable(),
  userType: z.string(),
  pwdInitYn: z.enum(["Y", "N"]),
  // 사양서 예시는 문자열 "20", 실제 응답은 int 30 — 양쪽 수용(coerce).
  groupKind: z.coerce.number().int().nullable(),
});

export type SekoLoginData = z.infer<typeof sekoLoginDataSchema>;

export const sekoLoginResponseSchema = z.object({
  data: sekoLoginDataSchema.nullable(),
  result: sekoResultSchema,
});
