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

  // 세션 캐시 purge 정책 (auth-client#performLogout 참조):
  // 로그아웃 시점에는 clear 하지 않고(활성 쿼리 재요청 → 401 방지), 로그아웃→로그인 "전환"
  // 시점에 이전 세션 캐시를 1회 비운다. 이 시점엔 이전 화면이 이미 언마운트되어 재요청이 없고,
  // 쿠키도 유효(로그인 완료)하므로 안전하다. 다른 탭 로그인(storage 이벤트)도 동일 처리.
  const wasLoggedInRef = useRef(false);
  useEffect(() => {
    const readFlag = () => {
      try {
        return localStorage.getItem(AUTH_FLAG_KEY) === "1";
      } catch {
        return false;
      }
    };
    wasLoggedInRef.current = readFlag();

    const handleAuthChange = () => {
      const isLoggedIn = readFlag();
      // 로그아웃→로그인 전환에서만 purge. 이미 로그인 상태의 재-dispatch 는 무시.
      if (isLoggedIn && !wasLoggedInRef.current) {
        queryClient.clear();
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
