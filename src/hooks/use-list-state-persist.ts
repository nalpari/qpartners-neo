"use client";

import { useEffect } from "react";

/**
 * 목록 화면별 sessionStorage 키 묶음.
 *   - flag    : 복원 요청 플래그. 상세/생성/편집 페이지에서 목록으로 복귀하기 직전 "1" 로 설정한다.
 *               목록 마운트 시 1회 소비 (consume 후 삭제) — 그 외 경로(메뉴 클릭, 새로고침)로
 *               목록 진입 시 플래그가 없으니 자동 초기화된다.
 *   - filters : 검색조건 직렬화 저장소 (URL 쿼리 문자열 또는 JSON).
 *   - pageSize: 페이지 표시 개수 저장소.
 *
 * 정책: "상세/생성/편집 → 목록" 왕복에서만 직전 검색조건/페이지 표시 개수가 복원되고,
 *       그 외 진입(다른 메뉴, 새로고침, 초기화 후 재진입)에서는 모두 초기화된다.
 */
export const LIST_RESTORE_KEYS = {
  contents: {
    flag: "qp:list:contents:restore",
    filters: "qp:list:contents:filters",
    pageSize: "qp:list:contents:pageSize",
  },
  bulkMail: {
    flag: "qp:list:bulk-mail:restore",
    filters: "qp:list:bulk-mail:filters",
    pageSize: "qp:list:bulk-mail:pageSize",
  },
} as const;

export type ListScope = keyof typeof LIST_RESTORE_KEYS;

/**
 * scope 별 consumeListRestoreFlag 결과 캐시.
 *   - 같은 컴포넌트 마운트 안에서 useState lazy init 이중 호출 / 두 훅의 동일 scope 조회를
 *     같은 결과로 만들어 주는 short-lived 캐시.
 *   - 새 setListRestoreFlag 호출 또는 invalidateListRestoreCache(unmount 시) 호출로 무효화.
 */
const _scopeDecisionCache = new Map<ListScope, boolean>();

/**
 * 상세/생성/편집 페이지에서 목록 라우트로 router.push 하기 직전 호출.
 * 다음 목록 마운트에서 sessionStorage 검색조건/페이지 표시 개수가 복원되도록 플래그 설정.
 * scope 캐시를 invalidate 하여 다음 consumeListRestoreFlag 가 새로 평가하도록 한다.
 */
export function setListRestoreFlag(scope: ListScope): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LIST_RESTORE_KEYS[scope].flag, "1");
  _scopeDecisionCache.delete(scope);
}

/**
 * 목록 컴포넌트 마운트 시 호출 — 플래그가 "1" 이면 true 반환 + sessionStorage 에서 삭제.
 * useState lazy init 안에서 호출 가능 (idempotent).
 *
 * 동작:
 *   - 첫 호출: sessionStorage 의 플래그 읽기 + 삭제 + cache 저장.
 *   - 같은 lifecycle 내 후속 호출 (Strict Mode 이중 호출 / 다른 훅의 동일 scope 조회):
 *     cache 값 반환. sessionStorage 재조회 없음 — 첫 호출이 플래그를 이미 삭제했어도 OK.
 *   - setListRestoreFlag 호출 또는 컴포넌트 unmount(useListStateCacheInvalidator) 시 cache 무효화.
 */
export function consumeListRestoreFlag(scope: ListScope): boolean {
  if (typeof window === "undefined") return false;
  const cached = _scopeDecisionCache.get(scope);
  if (cached !== undefined) return cached;

  const key = LIST_RESTORE_KEYS[scope].flag;
  const flag = window.sessionStorage.getItem(key);
  const result = flag === "1";
  if (result) window.sessionStorage.removeItem(key);
  _scopeDecisionCache.set(scope, result);
  return result;
}

/**
 * 목록 컴포넌트의 unmount 시 호출하는 훅 — cache 무효화.
 *
 * useEffect cleanup 에서 즉시 invalidate 하면 React Strict Mode 의 unmount→remount
 * 시뮬레이션 중간에 cache 가 비워져 두 번째 mount 가 새로 평가(=flag 이미 소비됨 → false)
 * 하는 회귀가 발생한다. setTimeout 으로 매크로태스크 다음에 invalidate 하여:
 *   - Strict Mode 의 즉시 remount(수 ms 이내): cache hit 유지 → 같은 결과로 복원 보장
 *   - 사용자의 정상 navigation(메뉴 클릭, 다른 페이지 경유): 100ms 이상 지나 cache miss → 새 평가
 *
 * 컴포넌트가 짧은 시간 내(<100ms) 재마운트되는 비정상 케이스는 stale cache 가 잠시 살아있을
 * 수 있으나, 그 경우에도 flag 가 이미 소비됐으므로 다음 평가에서 false 가 나와 결과가 같다.
 */
export function useListStateCacheInvalidator(scope: ListScope): void {
  useEffect(() => {
    return () => {
      const t = setTimeout(() => {
        _scopeDecisionCache.delete(scope);
      }, 100);
      // 같은 scope 가 즉시 remount 되어 같은 invalidator 가 새 setTimeout 을 걸어도
      // 이전 setTimeout 은 그대로 둔다 (둘 다 같은 cache 를 지우는 멱등 연산).
      void t;
    };
  }, [scope]);
}

/**
 * 목록 화면의 검색조건/페이지 등 URL 쿼리 상태를 sessionStorage 에 백업하고
 * 마운트 시 shouldRestore 가 true 이고 URL 쿼리가 비어 있으면 자동 복원하는 공통 훅.
 *
 * 사용 시나리오: 목록 → 상세/생성/편집 진입 → 복귀 시 직전 검색조건 유지 (같은 탭 세션 한정).
 *
 * 동작:
 *   - 마운트 시 1회: shouldRestore && currentQueryString === "" 이면 sessionStorage 값으로
 *     onRestore(stored) 호출. onRestore 안에서 router.replace 로 URL 을 복원하면 된다.
 *   - shouldRestore === false 면 sessionStorage 의 검색조건도 함께 삭제 — 다른 페이지 경유
 *     또는 새로고침으로 진입한 경우 이전 검색조건이 살아나는 것을 방지.
 *   - currentQueryString 이 바뀔 때마다 sessionStorage 에 동기화. 빈 쿼리는 sessionStorage
 *     에서 삭제 — 사용자가 초기화 버튼을 눌렀을 때 이전 검색조건이 부활하는 회귀 방지.
 *
 * SSR 안전: window 미존재 환경에서는 no-op.
 *
 * react-hooks/set-state-in-effect 정책 준수: 내부에서 setState 를 호출하지 않는다.
 */
export function useListStatePersist(options: {
  /** sessionStorage key — LIST_RESTORE_KEYS[scope].filters 사용 권장 */
  storageKey: string;
  /** consumeListRestoreFlag 결과를 그대로 전달. true 일 때만 복원, false 면 sessionStorage 삭제. */
  shouldRestore: boolean;
  /** 현재 URL 쿼리 문자열 (선행 `?` 제외, 비어 있으면 빈 문자열) */
  currentQueryString: string;
  /** 마운트 시 복원 콜백 — sessionStorage 의 저장값을 그대로 받는다 */
  onRestore: (storedQueryString: string) => void;
}) {
  const { storageKey, shouldRestore, currentQueryString, onRestore } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentQueryString !== "") return; // URL 에 이미 쿼리가 있으면 그것 우선

    if (shouldRestore) {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) onRestore(stored);
    } else {
      // 상세/생성/편집 경유가 아닌 진입(메뉴 클릭, 새로고침 등) — 검색조건 초기화 보장.
      window.sessionStorage.removeItem(storageKey);
    }
    // 마운트 시 1회만 — currentQueryString/onRestore/shouldRestore 변경 추적 X.
    // shouldRestore 는 consumeListRestoreFlag 가 마운트 시 한 번 평가한 값이므로 변하지 않음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentQueryString) {
      window.sessionStorage.setItem(storageKey, currentQueryString);
    } else {
      // 초기화 버튼 등으로 쿼리가 비워졌을 때 sessionStorage 도 같이 비워서
      // 다음 복원 시 이전 검색조건이 부활하지 않도록 한다.
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey, currentQueryString]);
}
