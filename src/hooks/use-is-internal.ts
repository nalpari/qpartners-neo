"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";

function subscribeAuthFlag(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTH_FLAG_KEY) callback();
  };
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 사내직원(ADMIN) 여부 판별 훅 — hydration-safe.
 *
 * - SSR/초기 hydration: 항상 `false` 반환 (서버는 auth 상태 모름 → 일치 보장)
 * - 클라이언트 hydration 완료 후: localStorage 플래그 + 캐시된 user 정보로 재평가
 * - useSyncExternalStore 의 getServerSnapshot 을 `() => false` 로 고정해
 *   SSR HTML 과 초기 클라이언트 렌더가 항상 동일하도록 강제 (hydration mismatch 방지)
 */
export function useIsInternal(): boolean {
  const hasAuthFlag = useSyncExternalStore(
    subscribeAuthFlag,
    () => {
      try {
        return localStorage.getItem(AUTH_FLAG_KEY) === "1";
      } catch (e) {
        console.warn("[useIsInternal] localStorage.getItem 실패:", e);
        return false;
      }
    },
    () => false,
  );

  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  return hasAuthFlag && user?.userTp === "ADMIN";
}
