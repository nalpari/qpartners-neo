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
 * 사내직원(ADMIN) 여부 판별 훅 — **UI hint 전용**, hydration-safe.
 *
 * ⚠️ 보안 경계 주의:
 * - 이 훅은 **UI 노출 제어**(버튼/라벨 숨김)만 담당. 권한 판별의 truth source 는 서버.
 * - 모든 mutating API 경로(POST/PUT/DELETE /api/contents/:id 등)는 서버에서
 *   `requireAdmin` · `canModifyResource` 로 재검증됨. 본 훅을 우회해도 서버가 거부.
 *
 * 주요 동작:
 * - AUTH_FLAG_KEY("1") 는 **모든 로그인 사용자 공용 플래그** (ADMIN 전용 아님 — STORE/SEKO/GENERAL
 *   로그인 시에도 세팅됨). ADMIN 판별의 실질은 `user.userTp === "ADMIN"` 분기.
 * - SSR/초기 hydration: 항상 `false` 반환 (서버는 auth 상태 모름 → SSR-client 일치 보장)
 * - 클라이언트 hydration 완료 후: localStorage 플래그 전파 + Gnb(layout) 가 주입한 `["auth", "login-user-info"]`
 *   쿼리 캐시(setQueryData) 로 재평가
 * - useSyncExternalStore 의 getServerSnapshot 을 `() => false` 로 고정해 hydration mismatch 방지
 *
 * 상위 의존:
 * - `layout` 의 Gnb 컴포넌트가 `fetchAuthMe` 로 user 정보를 캐시에 주입. Gnb 가 마운트되지 않은
 *   페이지 구조에서는 user 쿼리가 비어 있어 영구 `false` 반환 — 현재 프로젝트 구조상 Gnb 는 전역 배치됨.
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
