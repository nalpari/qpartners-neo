import axios from "axios";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";
import { resetListRestoreState } from "@/hooks/use-list-state-persist";

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
 * - 목록 복원 상태(sessionStorage + history 마커)도 함께 폐기 — 세션 만료는 로그아웃을 거치지
 *   않고 사용자가 바뀔 수 있는 경로다. 정리하지 않으면 사내 전용 정렬(掲示対象)이 복원 대상으로
 *   남아 뒤로가기마다 `sortTargets=true` 가 전송되어 403 으로 목록이 조회 불가 상태로 굳고,
 *   같은 탭에서 다음 사용자가 이전 사용자의 검색조건을 그대로 보게 된다.
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
      // nginx 등 리버스 프록시의 HTTP Basic Auth 챌린지(WWW-Authenticate: Basic ...)는
      // 앱 자체 JWT 인증 만료와 무관 — AUTH_FLAG 를 건드리면 dev 환경에서 cascade 재렌더 +
      // queryKey 변경으로 prompt 가 반복 표출된다. Basic 챌린지는 무시하고 원본 에러만 전달.
      const wwwAuth = error.response.headers?.["www-authenticate"];
      const isBasicChallenge = typeof wwwAuth === "string" && /^\s*basic\b/i.test(wwwAuth);
      if (!isBasicChallenge) {
        try {
          if (localStorage.getItem(AUTH_FLAG_KEY) === "1") {
            localStorage.removeItem(AUTH_FLAG_KEY);
            // 목록 복원 상태 폐기는 AUTH_FLAG 가 실제로 서 있던 경우(=세션이 끊긴 경우)에만
            // 수행한다. 비로그인 상태의 401(로그인 실패 등)까지 정리하면 불필요한 부수효과가 된다.
            resetListRestoreState();
            window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
          }
        } catch (e) {
          console.warn("[axios] AUTH_FLAG_KEY 정리 실패:", e);
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
