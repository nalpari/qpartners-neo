"use client";

import { useEffect } from "react";
import {
  SEKO_AUTOLOGIN_FAILURE_MESSAGE,
  SEKO_AUTOLOGIN_MESSAGE_SOURCE,
  type SekoAutoLoginFailureMessage,
  type SekoAutoLoginFailureReason,
} from "@/lib/seko-autologin-result";

/**
 * SEKO 자동로그인 실패 결과 화면 — 자동로그인 창이 실패했을 때만 도달한다.
 *
 * 하는 일은 둘뿐이다: **부모 탭에 사유를 넘기고 스스로 닫는다.** 안내 문구를 실제로 띄우는
 * 쪽은 부모 탭이다 — 새 창은 사용자가 보고 있지 않을 수 있고(백그라운드 팝업), 무엇보다
 * 이 창은 곧 닫히기 때문이다.
 *
 * 문구는 상태로 감추지 않고 **항상 렌더한다.** 전달·닫기가 정상이면 한 프레임 뒤 창이 사라져
 * 보이지 않고, 부모가 없거나(사용자가 URL 로 직접 진입, opener 유실) 닫기가 막히면 그대로
 * 남아 폴백이 된다. 감췄다가 되돌리는 편이 오히려 "아무것도 안 뜨는 빈 창"을 만든다.
 */
export function SekoAutoLoginResult({
  reason,
}: {
  reason: SekoAutoLoginFailureReason;
}) {
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) return;

    const message: SekoAutoLoginFailureMessage = {
      source: SEKO_AUTOLOGIN_MESSAGE_SOURCE,
      ok: false,
      reason,
    };
    try {
      // targetOrigin 을 자기 오리진으로 고정 — 부모가 다른 사이트로 이동해 있으면 전달되지
      // 않는 편이 맞다. `"*"` 로 열면 실패 사유가 임의 사이트로 새어 나간다.
      opener.postMessage(message, window.location.origin);
      window.close();
    } catch (error) {
      // 전달에 실패해도 창은 닫지 않는다 — 닫아버리면 사용자에게 아무 흔적도 남지 않는다.
      console.error("[SekoAutoLoginResult] 부모 탭 전달 실패:", error);
    }
  }, [reason]);

  return (
    <div className="flex flex-col items-center gap-4 px-5 py-20 text-center">
      <p className="text-base">{SEKO_AUTOLOGIN_FAILURE_MESSAGE[reason]}</p>
      <p className="text-sm text-gray-500">
        このウィンドウを閉じて、マイページからもう一度お試しください。
      </p>
    </div>
  );
}
