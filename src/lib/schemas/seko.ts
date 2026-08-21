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

/**
 * SEKO Connector 공용 응답 result 구조.
 *
 * 성공/실패 판정에 쓰는 `resultCode` 만 strict 로 두고 나머지는 결손에 관대하게 둔다.
 * 이 스키마는 모든 응답이 통과하는 단일 지점이라, 미소비 필드 하나가 빠지는 것만으로
 * 정상적인 비즈니스 거부(errorCode 가 담겨 온)까지 전부 502 "応答形式が正しくありません" 로
 * 뭉개지고 401/400 매핑 로직이 실행조차 되지 않는다.
 * (사양서와 실물이 이미 1회 어긋난 시스템 — `resultMsg` → `resultMessage`)
 */
export const sekoResultSchema = z.object({
  code: z.number().nullish(),
  message: z.string().nullish(),
  // 판정 근거 — 유지. 여기서 관대해지면 fail-closed 가 깨진다.
  resultCode: z.string(),
  resultMessage: z.string().nullish(),
  // 오류 응답에만 포함(실측). null 로 명시 전송하는 구현도 수용.
  errorCode: z.string().nullish(),
});

export type SekoResult = z.infer<typeof sekoResultSchema>;

// ─── No.2 Seko Login API (/api/seko/login) ───

const sekoLoginDataSchema = z.object({
  token: z.string(),
  expiredAt: z.string(),
  userId: z.string(),
  loginId: z.string(),
  // getUserInfo 스키마와 동일 정책 — 엣지 계정 대비 nullable.
  // login 은 실패 시 로그인 자체가 502 로 막히므로 더 관대해야 한다
  // (호출부 login/route.ts 의 `?? ""` 폴백이 이 완화로 비로소 유효해진다).
  sei: z.string().nullable(),
  mei: z.string().nullable(),
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
  // No.9 2FA — note-51(2026-08-18) 로 login·getUserInfo 응답에 추가된 2차인증 일시.
  // 형식은 "YYYY-MM-DD HH:mm:ss" (QSP 의 "YYYY.MM.DD" 와 구분자가 다르다 — `parseSekoDate` 사용).
  // 한 번도 2FA 를 하지 않은 계정은 null 이므로 nullish (구계정의 필드 누락까지 허용).
  // coerce 는 groupKind 와 같은 이유 — 커넥터가 타입을 바꿔 보내도(epoch 숫자 등) 로그인 응답
  // 파싱이 깨져 시공점 전체가 502 로 막히는 일을 막는다. nullish 가 null/undefined 를 먼저
  // 처리하므로 coerce 가 "null" 문자열을 만들지 않고, 형식이 어긋나면 parseSekoDate 가 null 을
  // 반환해 fail-closed(2FA 요구)로 안전하게 열화한다.
  secAuthDt: z.coerce.string().nullish(),
});

export type SekoLoginData = z.infer<typeof sekoLoginDataSchema>;

export const sekoLoginResponseSchema = z.object({
  data: sekoLoginDataSchema.nullable(),
  result: sekoResultSchema,
});

// ─── No.1 Seko Auto Login API (/api/seko/autologin) — Bearer ───
// **아웃바운드**: TO-BE 에 로그인한 시공점 회원을 AS-IS Q.Partners 로 로그인된 채 내보낸다.
// (외부 3사 → TO-BE 인 inbound 자동로그인(`auth/auto-login/inbound`, AES-128-CBC)과는 별개다.)
//
// 응답 `autologinUrl` 은 AS-IS 도메인의 일회용 링크다. 실측(2026-08-20 preview):
//  - 형태: `{AS-IS base}/api/autologin/{64자 토큰}`
//  - 접속 시 302 + `Set-Cookie: SESS_PUBLISH` / `hqj_user` (path=/) → 사이트 전체 로그인 상태
//  - **착지는 항상 사이트 루트(`/`)** — 요청 본문 파라미터(returnUrl/url/redirectUrl/page)도,
//    URL 쿼리(?returnUrl=·?redirect=)도 200 으로 받아주기만 하고 무시된다.
//    화면 지정은 AS-IS 지원이 필요해 ENDO 질의 중(Redmine #1750 note-23·25 관련).
//  - **1회·1분 유효**. 재접속 시 「このリンクは無効か、有効期限が切れています」
//    → 링크를 미리 열어보는 프리페치가 URL 을 소진시키므로 호출부는 클릭 시에만 요청해야 한다.
const sekoAutoLoginDataSchema = z.object({
  // 빈 값·공백·"/" 는 AS-IS 루트를 가리킨다 — 자동로그인 없이 홈으로 보내는 꼴이 되므로
  // 파싱 단계에서 거부한다(호출부는 502 로 종료). fileUrl 과 동일 정책.
  autologinUrl: z
    .string()
    .trim()
    .refine((v) => v.length > 0 && v !== "/"),
});

export const sekoAutoLoginResponseSchema = z.object({
  data: sekoAutoLoginDataSchema.nullable(),
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

// ─── No.5 Seko File Download API (/api/seko/fileDownload) — Bearer ───
// fileType: RECEIPT=수강료영수증 / CERT1=시공증명서1. CERT2 는 미사용(QA#12) — 스키마 enum 에는
// 남겨두되 화면에서 노출하지 않는다.
//
// 응답은 파일 바이너리가 아니라 **메타데이터**다. `fileUrl` 을 Bearer 로 재fetch 해야 실제 파일을
// 얻는다(2단계) — 커넥터 `sekoFileDownload` 참조.
//
// 실측(2026-08-19 preview):
//  - RECEIPT → contentType=text/html,      200 / 3,971 bytes
//  - CERT1   → contentType=application/pdf, 200 / 287,746 bytes (매직바이트 %PDF-1.7)
//  - `fileSize` 는 응답에 실리지 않는 경우가 있어 optional. 신뢰하지 않고 실제 바이트로 판단한다.
const sekoFileDownloadDataSchema = z.object({
  fileName: z.string(),
  // 빈 값·공백·"/" 는 커넥터 base URL 루트를 가리킨다 — 파일 대신 커넥터 홈 응답을 Bearer 로
  // 받아 첨부파일로 내려주게 되므로 파싱 단계에서 거부한다(호출부는 502 로 종료).
  fileUrl: z
    .string()
    .trim()
    .refine((v) => v.length > 0 && v !== "/"),
  // 종류별로 상이(text/html · application/pdf). 누락 시 호출부가 실제 응답 헤더로 폴백.
  contentType: z.string().nullable(),
  fileSize: z.coerce.number().int().nullable().optional(),
});

export type SekoFileDownloadData = z.infer<typeof sekoFileDownloadDataSchema>;

export const sekoFileDownloadResponseSchema = z.object({
  data: sekoFileDownloadDataSchema.nullable(),
  result: sekoResultSchema,
});

// ─── No.8 Seko Email Check API (/api/seko/email/check) ───
// ⚠️ 사양서(20260811)는 loginId+groupKind+sei+mei 4개 필수로 기재하나, 실제로 4개를 보내면
//    400 INVALID_REQUEST 이고 **loginId 단독만** 200 이다 (2026-08-13 preview 실측).
//    스키마·요청은 실물 기준으로 둔다.
const sekoEmailCheckDataSchema = z.object({
  exists: z.boolean(),
  // 존재할 때만 채워진다. 이메일은 응답에 없으므로 호출부가 입력 loginId 를 그대로 쓴다
  // (시공점은 loginId = email).
  userId: z.string().nullish(),
});

export type SekoEmailCheckData = z.infer<typeof sekoEmailCheckDataSchema>;

export const sekoEmailCheckResponseSchema = z.object({
  data: sekoEmailCheckDataSchema.nullable(),
  result: sekoResultSchema,
});

// ─── No.7 Seko User List API (/api/seko/getUserList) ───
// 대량메일 수신자 수집 전용. X-Api-Key 인증(Bearer 아님), 페이징 없이 전량 반환.
//
// 실측(2026-08-21 preview, 104건):
//  - 요청 `status`: **스칼라 문자열/숫자만** 수용. `1`=利用可(96건) / `2`=利用不可(8건) /
//    미지정=전체(104건). 배열 `[1,2]` 는 무시되고 `"1,2"`·0·3·4·5 는 `INVALID_STATUS_ERROR`
//    (`statusの値が不正です`). 발송 대상은 이용가능 회원뿐이므로 호출부가 `1` 을 명시한다.
//  - 응답 항목은 5개 전부 104건에 존재. `userId` 는 숫자문자열("1")이라 string 이다.
//  - **이메일 필드가 따로 없다** — 시공점은 로그인 ID 가 곧 이메일이라 `loginId` 가 주소다.
//    사양서 필드표도 `loginId`(비고 Email) 이고 응답 예시의 `email` 쪽이 오기다.
//  - `sei`/`mei` 는 사양서 비고에 「메일 본문 수신자명」 — 호출부가 이어붙여 userName 으로 쓴다.
const sekoUserListItemSchema = z.object({
  userId: z.string(),
  // 수집의 유일한 주소원. 빈 값이면 수신자로 성립하지 않으므로 파싱 단계에서 거른다.
  loginId: z.string().trim().min(1),
  sei: z.string().nullish(),
  mei: z.string().nullish(),
  // 2026-08-17 상대측 추가분(M_USER.news_rcpt_yn). 그 이전 배포본에는 없으므로 nullish 로
  // 두고, 호출부가 "N" 만 제외한다 — 결손을 수신거부로 읽으면 전원이 조용히 누락된다.
  newsRcptYn: z.string().nullish(),
});

export type SekoUserListItem = z.infer<typeof sekoUserListItemSchema>;

// 개별 항목 결손이 목록 전체를 502 로 접지 않도록 항목 단위로 걸러낸다 — 회원 한 명의
// 데이터 이상으로 대량메일 발송 전체가 멈추면 장애 범위가 불필요하게 커진다.
// 걸러진 건수는 호출부가 `totalCount` 와 비교해 로그로 남긴다.
const sekoUserListDataSchema = z.object({
  totalCount: z.coerce.number().int().nullish(),
  list: z.array(z.unknown()).transform((rows) =>
    rows
      .map((row) => sekoUserListItemSchema.safeParse(row))
      .filter((r) => r.success)
      .map((r) => r.data),
  ),
});

export type SekoUserListData = z.infer<typeof sekoUserListDataSchema>;

export const sekoUserListResponseSchema = z.object({
  data: sekoUserListDataSchema.nullable(),
  result: sekoResultSchema,
});
