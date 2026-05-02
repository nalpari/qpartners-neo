"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import axios from "axios";

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
            // 401(인증 부재)은 retry 해도 결과가 바뀌지 않으므로 즉시 중단.
            // default 3회 retry 가 동작하면 다중 게이트 query 병렬 발사 시 같은 401 이 폭주하여
            // axios 응답 인터셉터(src/lib/axios.ts)의 dispatch 가 누적될 수 있다.
            // 401 외 에러는 default 3회 retry 유지.
            retry: (failureCount, error) => {
              if (axios.isAxiosError(error) && error.response?.status === 401) return false;
              return failureCount < 3;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
