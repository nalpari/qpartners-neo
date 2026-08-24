/**
 * 시공ID 유효기간 게이트 — 세션 발급·승격 시점의 일회성 검사.
 *
 * 화면설계서 p10「만료된 시공ID로 로그인 시 로그인 불가」의 실행부다. 판정 자체는
 * `evaluateSekoIdValidity`(순수 함수)가 하고, 여기서는 판정에 필요한 `sekoStatus`/`sekoLimit`
 * 을 `getUserInfo`(No.3)로 가져오는 I/O 와 차단 응답 재료를 담당한다.
 *
 * **왜 게이트가 로그인 한 곳으로 부족한가.**
 * `middleware.ts` 는 요청마다 시공ID 유효기간을 재검사하지 않는다. 따라서 인증 쿠키를 신규
 * 발급하거나 `twoFactorVerified:false` → `true` 로 **승격**하는 경로가 이 게이트를 통과해야
 * 한다. 한 곳이라도 빠지면 그 경로로 만료 계정이 완전한 세션을 받는다.
 * `role-active-gate` 가 `QpRole.isActive` 에 대해 같은 이유로 존재한다.
 *
 * 적용 경로:
 * - `POST /api/auth/login` (SEKO) — 단 `pwdInitYn="Y"` 는 생략(아래 참조)
 * - `POST /api/auth/password-init` (SEKO) — 위 생략분의 회수 지점
 * - `POST /api/auth/two-factor/verify` (SEKO) — 위 생략분의 또 다른 승격 지점
 *
 * **대상에서 빠진 지점 — `POST /api/auth/password-reset/confirm`.**
 * 미적용이 아니라 **더 이상 SEKO 세션을 발급하지 않는다.** 화면설계서 v1.4 p12 로 시공점
 * 초기화가 교체되면서 이 경로는 SEKO 토큰을 410 으로 접는다(자동 로그인 없음). 신규 경로인
 * `password-reset/seko/{check,reset}` 역시 세션을 발급하지 않아 게이트 대상이 아니다.
 *
 * **미적용 경로 — `POST /api/auth/auto-login/inbound`.**
 * 이 라우트도 `userTp="SEKO"` 를 정식 허용하고 8시간 쿠키를 발급하므로 원칙상 대상이지만,
 * **적용할 수단이 없다.** inbound 는 QSP `userDetail` 경유라 SEKO Bearer(`sekoToken`)를 확보하지
 * 않는데 판정 근거인 `sekoStatus`/`sekoLimit` 은 Bearer 전용 `getUserInfo`(No.3)에만 있고,
 * X-Api-Key 계열(No.7 `getUserList`)의 응답 5필드에는 두 값이 없다. 따라서 외부 3사 SSO 로
 * 진입한 만료 시공ID 계정은 **현재 이 게이트에 걸리지 않는다.**
 * 해소하려면 X-Api-Key 로 호출 가능한 회원정보 조회 I/F 가 필요하다(ENDO 질의 대상 —
 * errorCode 목록과 함께 요청).
 *
 * **로그인에서 `pwdInitYn="Y"` 를 생략하는 이유와 그 대가.**
 * 그 상태의 계정으로 `getUserInfo` 가 되는지 확인할 수단이 없다(해당 상태 테스트 계정 부재).
 * AS-IS 가 거부하면 아래 fail-closed 때문에 비밀번호 초기화 화면에 도달하기 전에 502 로 막혀
 * 영구 락아웃이 된다. 그래서 로그인에서는 접지 않되, **그 세션이 무엇이든 할 수 있게 되는
 * 시점**(초기화 완료 / 2FA 완료)에서 반드시 검사한다. 생략은 유예이지 면제가 아니다.
 *
 * 조회 실패는 **fail-closed** 다 — 유효기간을 확인하지 못한 채 통과시키면 게이트가 조용히
 * 무력화된다.
 *
 * ⚠️ `SEKO_CONNECTOR_BASE_URL` 미설정 시 `ConfigError` 가 그대로 전파된다(각 라우트의 최상위
 * catch 가 설정 오류로 구분해 응답). 여기서 흡수하면 env 누락이 외부 서버 장애로 오인된다.
 */

import { maskUserId } from "@/lib/interface-logger";
import { evaluateSekoIdValidity, sekoGetUserInfo } from "@/lib/seko-connector";

/** 만료 차단 문구 — 자격증명 오류와 구분되어야 한다. ID/PW 를 다시 입력해도 풀리지 않는 상태다. */
const SEKO_ID_EXPIRED_MESSAGE =
  "施工IDの有効期限が切れています。詳しくは管理者にお問い合わせください。";

export type SekoIdGateResult =
  | { valid: true }
  | { valid: false; status: 403 | 502; message: string };

/**
 * 시공ID 유효기간 검사.
 *
 * @param loginId  SEKO login 응답의 `loginId`(= 이메일). getUserInfo 의 식별자.
 * @param sekoToken  SEKO Bearer 토큰.
 * @param logPrefix  호출 라우트 태그.
 */
export async function checkSekoIdValid(
  loginId: string,
  sekoToken: string,
  logPrefix: string,
): Promise<SekoIdGateResult> {
  const infoResult = await sekoGetUserInfo(loginId, sekoToken, logPrefix);
  if (!infoResult.ok) {
    // fail-closed. 호출부는 직전에 sekoLogin 또는 유효한 세션을 확보한 상태라, 여기서의 실패는
    // 자격증명 문제가 아니라 조회 계통 장애로 본다.
    console.error(`${logPrefix} 시공ID 유효성 확인 실패 — 차단 (fail-closed)`, {
      userId: maskUserId(loginId),
      status: infoResult.error.status,
      // errorCode 없이는 「일시 장애」와 「이 계정에 대한 영구 거부」를 사후에도 구분할 수 없다.
      errorCode: infoResult.error.errorCode ?? "-",
    });
    return {
      valid: false,
      status: 502,
      message: "外部認証サーバーエラーが発生しました",
    };
  }

  const validity = evaluateSekoIdValidity({
    sekoStatus: infoResult.data.sekoStatus,
    sekoLimit: infoResult.data.sekoLimit,
  });
  if (!validity.valid) {
    console.warn(`${logPrefix} 시공ID 만료 — 차단`, {
      userId: maskUserId(loginId),
      reason: validity.reason,
    });
    return { valid: false, status: 403, message: SEKO_ID_EXPIRED_MESSAGE };
  }

  // 통과 사유도 남긴다 — 차단 로그가 0건인 상태는 「만료 계정이 없다」와 「게이트가 죽었다」를
  // 구분하지 못한다. NO_SEKO_ID 통과 건수는 이 게이트의 실효를 보는 유일한 지표다.
  console.log(`${logPrefix} 시공ID 판정 통과`, {
    userId: maskUserId(loginId),
    reason: validity.reason,
  });
  return { valid: true };
}
