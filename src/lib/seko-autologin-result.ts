/**
 * SEKO 자동로그인(No.1) 실패 전달 규약 — 라우트 → 결과 페이지 → 부모 탭이 공유하는 값.
 *
 * **왜 별도 전달 경로가 필요한가.** 자동로그인은 새 창에서 진행되고 성공하면 창이 AS-IS
 * (다른 오리진)로 넘어간다. 부모 탭은 그 창의 로드 결과를 읽을 수 없으므로, 목적 화면으로
 * 다시 보내기까지 고정 시간을 기다리는 수밖에 없다(`AUTOLOGIN_SETTLE_MS`).
 *
 * 그 대기가 **실패까지 덮어쓴다**는 것이 문제였다 — 실패 응답이 창에 떠 있어도 타이머는
 * 그대로 발화해 AS-IS 로 이동시켰고, 사용자는 어떤 실패든 「AS-IS 에 비로그인 상태로 도착」
 * 이라는 같은 증상만 봤다. 그래서 실패는 **동일 오리진 결과 페이지**로 돌려보내고, 그 페이지가
 * `postMessage` 로 부모에게 알린다. 부모는 메시지를 받으면 타이머를 취소하고 사유를 띄운다.
 *
 * 성공에는 메시지가 없다 — 성공하면 창이 이미 AS-IS 로 넘어가 우리 스크립트가 돌지 않는다.
 * 즉 **"메시지 없음 = 성공"** 이 아니라 "메시지 없음 = 실패 신호를 받지 못함"이며, 타이머는
 * 그 경우의 폴백이다. AS-IS 가 착지 화면 지정을 지원하면 이 파일과 타이머 모두 사라진다.
 */

/** postMessage 식별자 — 확장·다른 스크립트가 보낸 메시지와 구분한다. */
export const SEKO_AUTOLOGIN_MESSAGE_SOURCE = "seko-autologin";

export const SEKO_AUTOLOGIN_FAILURE_REASONS = [
  /** 시공점 회원이 아님 — AS-IS 계정 자체가 없다. */
  "not_seko",
  /** 2단계 인증 미완료. */
  "two_factor",
  /** TO-BE 세션 결손·만료, 또는 SEKO Bearer 만료. 재로그인 필요. */
  "session",
  /** 커넥터 호출 실패·설정 오류 등 나머지 전부. */
  "failed",
] as const;

export type SekoAutoLoginFailureReason =
  (typeof SEKO_AUTOLOGIN_FAILURE_REASONS)[number];

export function isSekoAutoLoginFailureReason(
  value: string | null | undefined,
): value is SekoAutoLoginFailureReason {
  return (
    value != null &&
    (SEKO_AUTOLOGIN_FAILURE_REASONS as readonly string[]).includes(value)
  );
}

/**
 * 사유별 안내 문구. 사유를 특정하지 못하면 `failed` 로 접는다 —
 * 쿼리는 사용자가 조작할 수 있으므로 화이트리스트 밖 값을 그대로 화면에 싣지 않는다.
 */
export const SEKO_AUTOLOGIN_FAILURE_MESSAGE: Record<
  SekoAutoLoginFailureReason,
  string
> = {
  not_seko: "施工店会員のみご利用いただけます。",
  two_factor: "2段階認証が必要です。",
  session: "セッションが無効です。再度ログインしてください。",
  failed:
    "自動ログインに失敗しました。しばらくしてからもう一度お試しください。",
};

/**
 * 이 사유는 서버가 인증 쿠키를 이미 만료시킨 상태다 — 부모 탭도 로그인 화면으로 보내야 한다.
 * 그러지 않으면 부모는 로그인된 UI 를 그대로 띄운 채 이후 모든 요청이 401 로 실패한다.
 */
export const SEKO_AUTOLOGIN_RELOGIN_REASON: SekoAutoLoginFailureReason =
  "session";

/** 결과 페이지 경로. 라우트의 리다이렉트 대상이자 부모 탭이 검증하는 값. */
export const SEKO_AUTOLOGIN_RESULT_PATH = "/seko-autologin-result";

export interface SekoAutoLoginFailureMessage {
  source: typeof SEKO_AUTOLOGIN_MESSAGE_SOURCE;
  ok: false;
  reason: SekoAutoLoginFailureReason;
}

/** 부모 탭 수신부 — `event.data` 는 임의 값이므로 형태를 직접 좁힌다. */
export function parseSekoAutoLoginFailure(
  data: unknown,
): SekoAutoLoginFailureMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Partial<SekoAutoLoginFailureMessage>;
  if (candidate.source !== SEKO_AUTOLOGIN_MESSAGE_SOURCE) return null;
  if (candidate.ok !== false) return null;
  if (!isSekoAutoLoginFailureReason(candidate.reason)) return null;
  return { source: SEKO_AUTOLOGIN_MESSAGE_SOURCE, ok: false, reason: candidate.reason };
}
