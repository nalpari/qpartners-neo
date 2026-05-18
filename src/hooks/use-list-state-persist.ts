"use client";

import { useEffect, useRef } from "react";

/**
 * Strict Mode 의 unmount→remount 시뮬레이션이 일어나는 grace window (ms).
 * 이 시간 안에 같은 컴포넌트가 재마운트되면 모듈 cache hit 으로 동일 결과를 보장하고,
 * 사용자의 정상 navigation(메뉴 클릭, 다른 페이지 경유)은 이 시간 이상 지나서 cache miss 가 되어
 * 새 평가가 일어난다. 100ms 는 React 19 Strict Mode 의 동기적 remount 가 수 ms 이내라는
 * 관찰에 충분한 여유를 둔 값.
 */
const STRICT_MODE_REMOUNT_GRACE_MS = 100;

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
 *   - 새 setListRestoreFlag 호출 또는 useListStateCacheInvalidator (unmount 시) 호출로 무효화.
 *   - 키 집합이 LIST_RESTORE_KEYS 의 ListScope 로 유한(2개 고정)하므로 영구 잔존이라도 메모리 누수 아님.
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
 *   - 사용자의 정상 navigation(메뉴 클릭, 다른 페이지 경유): grace window 이상 지나 cache miss → 새 평가
 *
 * 컴포넌트가 짧은 시간 내(grace window 이내) 재마운트되는 비정상 케이스는 stale cache 가 잠시
 * 살아있을 수 있으나, 그 경우에도 flag 가 이미 소비됐으므로 다음 평가에서 false 가 나와 결과가 같다.
 *
 * 빠른 navigation 으로 핸들이 누적되지 않도록 useRef 로 이전 setTimeout 핸들을 추적해
 * 새 등록 전 clearTimeout 한다.
 */
export function useListStateCacheInvalidator(scope: ListScope): void {
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current !== null) {
        clearTimeout(pendingTimeoutRef.current);
      }
      pendingTimeoutRef.current = setTimeout(() => {
        _scopeDecisionCache.delete(scope);
        pendingTimeoutRef.current = null;
      }, STRICT_MODE_REMOUNT_GRACE_MS);
    };
  }, [scope]);
}

