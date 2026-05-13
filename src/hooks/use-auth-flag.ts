"use client";

import { useSyncExternalStore } from "react";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";

/**
 * `AUTH_FLAG_KEY` localStorage 값을 SSR-safe 하게 구독하는 boolean 훅.
 *
 * 목적: 로그인 여부를 **첫 렌더부터 동기적으로** 알 수 있게 해서, Gnb 의 `/auth/login-user-info`
 * fetch 완료를 기다리는 동안 발생하던 layout flicker(HomeSidebar/HomeDownloads 의 mount/unmount,
 * `home-contents`/`home-notices` 의 `cacheScope="guest"` 1차 fetch 후 user 스코프 2차 fetch) 를 차단.
 *
 * - getServerSnapshot 은 항상 `false` — SSR/hydration mismatch 방지.
 * - 클라이언트 mount 후 localStorage 값으로 수렴.
 * - 로그인/로그아웃 시 `dispatchAuthChange` 또는 다른 탭의 `storage` 이벤트로 즉시 갱신.
 *
 * ⚠️ UI hint 전용. 권한 판정 / mutating API 보호의 truth source 는 서버.
 */
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

function getClientSnapshot(): boolean {
  try {
    return localStorage.getItem(AUTH_FLAG_KEY) === "1";
  } catch (e) {
    console.warn("[useAuthFlag] localStorage.getItem 실패:", e);
    return false;
  }
}

const getServerSnapshot = () => false;

export function useAuthFlag(): boolean {
  return useSyncExternalStore(subscribeAuthFlag, getClientSnapshot, getServerSnapshot);
}
