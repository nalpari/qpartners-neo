"use client";

import { useEffect } from "react";

/**
 * 목록 화면의 검색조건/페이지 등 URL 쿼리 상태를 sessionStorage 에 백업하고
 * 마운트 시 URL 이 비어 있으면 자동 복원하는 공통 훅.
 *
 * 사용 시나리오: 목록 → 상세 진입 → 상세에서 목록 복귀 시
 *   상세 페이지가 `router.push("/list")` 등 쿼리 없이 복귀하더라도
 *   직전 검색조건을 그대로 유지한다 (같은 탭 세션 한정).
 *
 * 동작:
 *   - 마운트 시 1회: currentQueryString 이 빈 문자열이고 sessionStorage 에 저장값이 있으면
 *     onRestore(stored) 호출. onRestore 안에서 router.replace 로 URL 을 복원하면 된다.
 *   - currentQueryString 이 바뀔 때마다 sessionStorage 에 동기화.
 *     빈 쿼리는 저장하지 않는다 — 복원 직후 빈 URL 로 덮어쓰여 다음 진입에서 복원이
 *     실패하는 회귀 방지.
 *
 * SSR 안전: window 미존재 환경에서는 no-op.
 *
 * react-hooks/set-state-in-effect 정책 준수: 내부에서 setState 를 호출하지 않는다.
 * 복원/저장 모두 외부 콜백 + sessionStorage 부수효과만 수행한다.
 */
export function useListStatePersist(options: {
  /** sessionStorage key — 화면별로 충돌 없는 고유 값 사용 (e.g. "qp:list:contents") */
  storageKey: string;
  /** 현재 URL 쿼리 문자열 (선행 `?` 제외, 비어 있으면 빈 문자열) */
  currentQueryString: string;
  /** 마운트 시 복원 콜백 — sessionStorage 의 저장값을 그대로 받는다 */
  onRestore: (storedQueryString: string) => void;
}) {
  const { storageKey, currentQueryString, onRestore } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentQueryString === "") {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) onRestore(stored);
    }
    // 마운트 시 1회만 — currentQueryString/onRestore 변경 추적 X.
    // 의도적으로 deps 를 빈 배열로 두어 "초기 진입 시 한 번만 복원" 시맨틱 유지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentQueryString) {
      window.sessionStorage.setItem(storageKey, currentQueryString);
    }
  }, [storageKey, currentQueryString]);
}
