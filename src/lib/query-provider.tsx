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
            // 4xx 클라이언트 에러는 retry 해도 결과가 바뀌지 않으므로 즉시 중단.
            // - 401(인증 부재): 다중 게이트 query 병렬 발사 시 axios 인터셉터 dispatch 누적 방지
            // - 403(권한 부족) / 404(없음): 비회원이 비공개 콘텐츠 접근 시 4번씩 호출되던 문제 차단
            // - 기타 4xx(400/422 등): 입력/상태 문제라 retry 무의미
            // 5xx 또는 네트워크 에러는 1회만 retry (총 2회 호출) — 일시 장애 흡수와
            // 서버 부하 절감의 균형점. default 3회는 동일 장애 시 4배 트래픽이라 과함.
            retry: (failureCount, error) => {
              if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status && status >= 400 && status < 500) return false;
              }
              return failureCount < 1;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
