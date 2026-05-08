"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
