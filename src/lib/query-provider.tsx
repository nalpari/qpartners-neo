"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // 브라우저 포커스 복귀 시 자동 refetch 비활성 — 탭 전환·최소화 후 돌아올 때
            // 테이블 등이 깜빡이며 재조회되는 현상 방지. 명시적 갱신은 invalidateQueries
            // 또는 개별 useQuery 옵션(refetchOnWindowFocus: true)으로 활성화.
            refetchOnWindowFocus: false,
            // 모든 에러에 대해 retry 비활성화 — 정확히 1회만 호출.
            // 4xx 는 retry 해도 의미 없고, 5xx/네트워크 일시 장애는 사용자 수동 새로고침으로 처리.
            // 서버 트래픽 부담을 최소화하고 에러 인지 시점을 즉시 노출하는 정책.
            retry: false,
          },
        },
      })
  );

  // 세션 캐시 정책 (auth-client#performLogout 참조):
  // - 로그인 전환(로그아웃→로그인): 이전 세션 캐시 전체 purge. 새 쿠키가 유효해 재요청해도 200.
  // - 로그아웃/타임아웃 전환(로그인→로그아웃): user 캐시만 제거해 헤더/relatedSites 등 user 파생
  //   UI 를 즉시 비로그인으로 정리. 이 시점엔 쿠키가 없으므로 clear(재요청 유발) 대신
  //   setQueryData(null) 사용 → 401 미발생.
  // 두 전환 모두 AUTH_CHANGE_EVENT(로그인/로그아웃) + storage(다른 탭)로 감지한다.
  const wasLoggedInRef = useRef(false);
  useEffect(() => {
    const readFlag = () => {
      try {
        return localStorage.getItem(AUTH_FLAG_KEY) === "1";
      } catch (error) {
        // localStorage 접근 실패(Safari 시크릿·샌드박스 iframe·SecurityError 등)를 silent 로 삼키면
        // 로그인 전환 감지 실패 → clear() 누락 → 세션 캐시 유출을 디버깅 불가하게 만든다.
        console.warn("[QueryProvider] AUTH_FLAG localStorage 접근 실패:", error);
        return false;
      }
    };
    wasLoggedInRef.current = readFlag();

    const handleAuthChange = () => {
      const isLoggedIn = readFlag();
      if (isLoggedIn && !wasLoggedInRef.current) {
        // 로그아웃→로그인 전환 — 이전 세션 캐시 전체 purge (쿠키 유효 → 재요청 200).
        queryClient.clear();
      } else if (!isLoggedIn && wasLoggedInRef.current) {
        // 로그인→로그아웃/타임아웃 전환 — user 만 제거해 user 파생 UI(헤더/relatedSites) 정리.
        // setQueryData 는 재요청을 유발하지 않으므로 쿠키 삭제 후에도 401 이 없다.
        queryClient.setQueryData(["auth", "login-user-info"], null);
      }
      wasLoggedInRef.current = isLoggedIn;
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_FLAG_KEY) handleAuthChange();
    };

    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
