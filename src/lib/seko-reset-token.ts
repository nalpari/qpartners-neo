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
 * 동일 시공ID 에 대한 1시간 발급 한도.
 *
 * 이 경로의 입력은 **시공ID 로 고정**된다(스키마가 `@` 포함 입력을 거부한다 —
 * `schemas/password-reset.ts` 참조). 시공ID 와 계정이 1:1 이므로 이 한도는 사실상 계정
 * 단위로 성립한다. 이메일 입력까지 받으면 같은 계정을 시공ID 로 한 번, 이메일로 한 번 —
 * 최대 2배까지 두드릴 수 있었다(둘을 서로 매핑할 I/F 가 없어 한 키로 합칠 수 없다).
 *
 * 판매점·일반(`password-reset/request`)의 시간당 3건과 같은 값으로 맞춘다.
 */
export const SEKO_RESET_TOKENS_PER_HOUR = 3;

/**
 * 토큰 조회·집계 키 정규화.
 *
 * 표기만 바꿔(대문자·앞뒤 공백) 한도를 우회하거나, 1단계에서 발급한 토큰을 2단계에서 못 찾는
 * 일이 없도록 양쪽이 같은 함수를 쓴다. 소문자화는 AS-IS 동작과도 맞는다 — No.8 `email/check`
 * 는 `HWQ99A9999` 와 `hwq99a9999` 를 같은 계정으로 응답한다(2026-08-24 preview 실측).
 */
export function normalizeSekoId(sekoId: string): string {
  return sekoId.trim().toLowerCase();
}
