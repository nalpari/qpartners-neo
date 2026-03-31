"use client";

import { useSyncExternalStore } from "react";
import { LoginContents } from "@/components/login/login-contents";
import { SAVED_ID_KEY, SAVED_TAB_KEY, VALID_TABS } from "@/components/login/types";
import type { TabType } from "@/components/login/types";

const noopSubscribe = () => () => {};

export function LoginLoader() {
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!isMounted) {
    return <LoginContents />;
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
    />
  );
}
