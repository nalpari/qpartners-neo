"use client";

import { useSyncExternalStore } from "react";
import { LoginContents } from "@/components/login/login-contents";
import { SAVED_ID_KEY, SAVED_TAB_KEY, VALID_TABS } from "@/components/login/types";
import type { TabType } from "@/components/login/types";

const noopSubscribe = () => () => {};

interface LoginLoaderProps {
  /** 서버에서 파싱한 자동로그인/SSO 실패 메시지 — 초기 error 상태로 주입 */
  initialError?: string | null;
  /** 비밀번호 초기화 메일에서 진입 시 reset-token 쿼리 — 클라이언트가 verify 후 PersonalInfoPopup 오픈 */
  initialResetToken?: string | null;
}

export function LoginLoader({ initialError = null, initialResetToken = null }: LoginLoaderProps) {
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!isMounted) {
    return <LoginContents initialError={initialError} initialResetToken={initialResetToken} />;
  }

  const savedId = localStorage.getItem(SAVED_ID_KEY) ?? "";
  const rawTab = localStorage.getItem(SAVED_TAB_KEY);
  const savedTab: TabType = VALID_TABS.includes(rawTab as TabType)
    ? (rawTab as TabType)
    : "dealer";

  return (
    <LoginContents
      key={`${savedTab}-${savedId}`}
      initialSavedId={savedId}
      initialSavedTab={savedTab}
      initialError={initialError}
      initialResetToken={initialResetToken}
    />
  );
}
