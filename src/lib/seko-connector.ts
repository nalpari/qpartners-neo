/**
 * AS-IS Q.Partners(시공점/SEKO) Connector API 클라이언트.
 *
 * QSP 연동(`qsp-member.ts`) 패턴을 그대로 미러링한다:
 *  - framework-agnostic: NextResponse 를 반환하지 않고 `{ ok }` 결과 객체 반환 → 호출부에서 HTTP 변환
 *  - `fetchWithLog` 로 `qp_interface_log` 자동 기록 (system: "SEKO")
 *  - 응답은 Zod `safeParse` — 스키마 불일치/파싱 실패 시 502
 *
 * 인증 2종 (사양서 + 2026-08-07 스모크 확인):
 *  - **Bearer**: login 응답 token(24h) 을 Authorization 헤더로 전달
 *  - **X-Api-Key**: 서버 고정키
 *
 * SEKO 는 인증/검증 실패도 **HTTP 400 + result.resultCode="E" + errorCode** 로 응답하므로,
 * `!response.ok` 만으로 502 처리하지 않고 본문을 파싱해 errorCode 를 추출한다(QSP 와 다른 점).
 *
 * 접속정보(base URL)는 환경변수 주입 — 미설정 시 **호출 시점** ConfigError.
 * (부팅은 막지 않음 — SEKO 미사용 환경 고려. 환경별 값은 .env 로 주입, 코드 하드코딩 금지.)
 *
 * 본 파일은 커넥터 기반(공통 helper + No.2 Login)을 정의한다.
 * 나머지 API(getUserInfo/updateUserInfo/changePwd/getUserList/email·check 등)는 각 I/F 브랜치에서 추가된다.
 */

import { ConfigError } from "@/lib/errors";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import {
  sekoLoginResponseSchema,
  type SekoLoginData,
} from "@/lib/schemas/seko";

export type SekoFetchError = {
  error: string;
  status: number;
  /** SEKO result.errorCode — 화면분기(비번만료/미초기화 등) 처리용. 호출부에서 사용. */
  errorCode?: string;
};

const SEKO_TIMEOUT_MS = 10_000;
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** SEKO Connector base URL (env `SEKO_CONNECTOR_BASE_URL`). 끝 슬래시 제거. */
function sekoBaseUrl(): string {
  const url = process.env.SEKO_CONNECTOR_BASE_URL?.trim();
  if (!url) {
    throw new ConfigError(
      "SEKO_CONNECTOR_BASE_URL is not set (시공점 Connector base URL 미설정)",
    );
  }
  return url.replace(/\/+$/, "");
}

function sekoEndpoint(path: string): string {
  return `${sekoBaseUrl()}${path}`;
}

/**
 * No.2 Seko Login API — 시공점 ID/PW 로그인.
 * 성공 시 Bearer 토큰(24h) + 회원정보 반환. 이후 Bearer 계열 API 에 token 을 전달한다.
 */
export async function sekoLogin(
  loginId: string,
  pwd: string,
  logTag: string,
): Promise<
  | { ok: true; data: SekoLoginData }
  | { ok: false; error: SekoFetchError }
> {
  let response: Response;
  try {
    response = await fetchWithLog(
      sekoEndpoint("/api/seko/login"),
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ loginId, pwd }),
        cache: "no-store",
        signal: AbortSignal.timeout(SEKO_TIMEOUT_MS),
      },
      {
        system: "SEKO",
        direction: "OUTBOUND",
        apiName: "login",
        callerRoute: logTag,
        userId: maskUserId(loginId),
        userType: "SEKO",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConfigError) throw error;
    console.error(`${logTag} SEKO 로그인 호출 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    console.error(`${logTag} SEKO 로그인 응답 파싱 실패 (status: ${response.status}):`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }

  const parsed = sekoLoginResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`${logTag} SEKO 로그인 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }

  const { data, result } = parsed.data;
  if (result.resultCode !== "S" || !data) {
    // 비즈니스 거부(자격증명 오류·비번 미초기화 등) — HTTP 400 이라도 여기서 처리.
    console.warn(
      `${logTag} SEKO 로그인 거부 (resultCode: ${result.resultCode}, errorCode: ${result.errorCode ?? "-"})`,
    );
    return {
      ok: false,
      error: { error: "ログインに失敗しました", status: 401, errorCode: result.errorCode },
    };
  }

  return { ok: true, data };
}
