/**
 * 시공점(SEKO) 비밀번호 초기화 재설정 토큰 — 1·2단계 공용 상수/정규화.
 *
 * 화면설계서 v1.4 p12 의 시공점 초기화는 메일 링크를 거치지 않는다. 그래서 두 단계
 * (`/api/auth/password-reset/seko/check` → `.../reset`)를 잇는 유일한 서버 상태가 이 토큰이다.
 * `qp_password_reset_tokens` 를 재사용하되 `userType="SEKO"` 행은 **이 흐름 전용**이며,
 * 메일 링크 경로(`verify`/`confirm`)는 이 행을 처리하지 않는다.
 */

/**
 * 토큰 TTL. 판매점·일반의 메일 링크(1시간)보다 짧다 — 팝업 안에서 곧바로 이어지는 단계라
 * 긴 유효기간이 필요 없고, 짧을수록 유출된 토큰의 창이 좁아진다. 비밀번호를 고민해 입력하는
 * 시간은 넉넉히 덮는다.
 */
export const SEKO_RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * 동일 식별자에 대한 1시간 발급 한도.
 *
 * ⚠️ **계정 단위가 아니라 식별자 단위다.** 시공점은 **시공ID 와 이메일 둘 다**로 로그인하고
 * (No.8 `email/check` 의 `loginId` 가 「メールまたは施工ID」인 이유), 둘을 서로 매핑할 수단이
 * 없다 — No.8 응답에 이메일이 없고, No.3 `getUserInfo` 는 Bearer 전용이라 로그인 불가 상태에서
 * 호출할 수 없다. 따라서 한 계정을 겨눈 시도는 최대 이 한도의 **2배**(시공ID 로 한 번, 이메일로
 * 한 번)까지 가능하다. 매핑 수단이 생기면 정규화 키를 계정으로 승격할 수 있다.
 *
 * 판매점·일반(`password-reset/request`)의 시간당 3건과 같은 값으로 맞춘다.
 */
export const SEKO_RESET_TOKENS_PER_HOUR = 3;

/**
 * 토큰 조회·집계 키 정규화.
 *
 * 표기만 바꿔(대문자·앞뒤 공백) 한도를 우회하거나, 1단계에서 발급한 토큰을 2단계에서 못 찾는
 * 일이 없도록 양쪽이 같은 함수를 쓴다. 이메일 로그인도 같은 필드로 들어오므로 소문자화가
 * 이메일 표기 차이(`A@b.jp` vs `a@b.jp`)까지 함께 흡수한다.
 */
export function normalizeSekoId(sekoId: string): string {
  return sekoId.trim().toLowerCase();
}
