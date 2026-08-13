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
  // 현재 소비처 없음. nullish 로 필드 누락(undefined)까지 허용 — coerce 가 NaN 을 만들어
  // 미사용 필드 하나 때문에 로그인 전체가 502 로 떨어지는 것을 방지한다.
  groupKind: z.coerce.number().int().nullish(),
});

export type SekoLoginData = z.infer<typeof sekoLoginDataSchema>;

export const sekoLoginResponseSchema = z.object({
  data: sekoLoginDataSchema.nullable(),
  result: sekoResultSchema,
});

// ─── No.3 Seko User Info API (/api/seko/getUserInfo) ───

const sekoUserInfoDataSchema = z.object({
  userId: z.string(),
  loginId: z.string(),
  // 성/이름: 엣지 계정 대비 nullable (호출부가 `?? ""` 방어 — 스키마-소비부 정합, 코드리뷰 반영).
  sei: z.string().nullable(),
  mei: z.string().nullable(),
  seiKana: z.string().nullable(),
  meiKana: z.string().nullable(),
  email: z.string().nullable(),
  userType: z.string(),
  // 시공점 종류 (4=시공점/5=델타/6=스미토모/7=델타 SAVeR-H2). 문자열 대비 coerce.
  supplierKind: z.coerce.number().int().nullable(),
  storeName: z.string().nullable(),
  storeNameKana: z.string().nullable(),
  zipcode: z.string().nullable(),
  pref: z.coerce.number().int().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  telNo: z.string().nullable(),
  fax: z.string().nullable(),
  sekoId: z.string().nullable(),
  sekoStatus: z.coerce.number().int().nullable(),
  sekoIssueDate: z.string().nullable(),
  sekoLimit: z.string().nullable(),
  deltaStatus: z.coerce.number().int().nullable(),
  status: z.string().nullable(),
  // note-46 에서 getUserInfo/updateUserInfo 에 추가(초기값 Y). 구계정 대비 nullable.
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
});

export type SekoUserInfoData = z.infer<typeof sekoUserInfoDataSchema>;

export const sekoUserInfoResponseSchema = z.object({
  data: sekoUserInfoDataSchema.nullable(),
  result: sekoResultSchema,
});

// ─── 공용: data 없는 응답 (No.4 updateUserInfo / No.6 changePwd) ───
// 성공 시 data:null, result.resultCode 로만 성공 판정.
// (No.4 는 newsRcptYn 만 갱신, No.6 은 비밀번호 변경 — 둘 다 반환 데이터 없음)
export const sekoNoDataResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: sekoResultSchema,
});
