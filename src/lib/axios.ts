import axios from "axios";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15_000,
});

/**
 * 401 응답 시 stale AUTH_FLAG_KEY 정리 — 비로그인 상태로 즉시 수렴.
 *
 * cookie 만료 등으로 localStorage AUTH_FLAG_KEY="1" 만 stale 하게 남으면
 * useMePermissionsQuery / useMenuTree 등 hasAuthFlag 게이트 query 가 매 새로고침마다
 * 401 을 받으며 반복 호출된다. 개별 queryFn 에 401 처리를 분산하면 새 hook 추가 시 같은
 * 누락이 재발하므로 axios 응답 인터셉터에 일원화한다.
 *
 * 동작:
 * - AUTH_FLAG_KEY === "1" 일 때만 정리 + AUTH_CHANGE_EVENT 발행 (idempotent 가드)
 *   → 로그인 실패 401 / 2FA 미스매치 401 등 AUTH_FLAG 가 set 되지 않은 상태에서는
 *     불필요한 dispatch 가 발생하지 않아 다탭 비로그인 오인식을 차단한다.
 * - useSyncExternalStore 구독 컴포넌트(Gnb 등)가 즉시 리렌더 → enabled false → 후속 호출 차단
 * - 원본 에러는 그대로 reject — 호출측 onError / 401 분기 흐름 유지
 *
 * 안전성:
 * - baseURL "/api" same-origin 만 사용 → 401 의도는 단일(인증 부재). 권한 부족은 403.
 * - SSR/RSC 컨텍스트는 typeof window 가드로 통과
 * - axios.isAxiosError 로 비-axios throw(타임아웃·abort·사용자 throw) 까지 안전 narrowing
 */
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error)
      && error.response?.status === 401
      && typeof window !== "undefined"
    ) {
      try {
        if (localStorage.getItem(AUTH_FLAG_KEY) === "1") {
          localStorage.removeItem(AUTH_FLAG_KEY);
          window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
        }
      } catch (e) {
        console.warn("[axios] AUTH_FLAG_KEY 정리 실패:", e);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
