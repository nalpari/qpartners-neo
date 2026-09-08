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
 *   - sort    : ag-grid 헤더 클릭 정렬 저장소 (contents 전용).
 *
 * 정책: "상세/생성/편집 → 목록" 왕복(flag)과 브라우저 뒤로/앞으로 복귀(history 마커,
 *       useListHistoryMarker 참조)에서만 직전 검색조건/페이지 표시 개수가 복원되고,
 *       그 외 진입(다른 메뉴, 새로고침, 초기화 후 재진입)에서는 모두 초기화된다.
 *
 * 저장소는 scope 당 1슬롯이다 — 같은 목록의 history entry 가 2개 이상 쌓인 상태에서
 * 오래된 entry 로 뒤로가면 그 entry 당시가 아니라 **가장 최근 검색조건**이 복원된다.
 * Redmine #2490 의 요구 범위(목록 → 상세 → 뒤로가기)에서는 발생하지 않는 한계로,
 * entry 단위 저장(history.state 스냅샷)은 복잡도 대비 실익이 없다고 판단해 두지 않는다.
 */
export const LIST_RESTORE_KEYS = {
  contents: {
    flag: "qp:list:contents:restore",
    filters: "qp:list:contents:filters",
    pageSize: "qp:list:contents:pageSize",
    sort: "qp:list:contents:sort",
  },
  bulkMail: {
    flag: "qp:list:bulk-mail:restore",
    filters: "qp:list:bulk-mail:filters",
    pageSize: "qp:list:bulk-mail:pageSize",
  },
} as const;

export type ListScope = keyof typeof LIST_RESTORE_KEYS;

/* ------------------------------------------------------------------ *
 * sessionStorage 안전 접근
 * ------------------------------------------------------------------ */

/**
 * "사이트 데이터 차단" 설정 브라우저·일부 프라이빗 모드에서는 `window.sessionStorage` 에
 * **접근만 해도** SecurityError 가 던져진다. 목록 복원은 부가 기능이므로 스토리지 실패는
 * 전부 조용한 no-op 으로 흡수한다 — 호출부(로그인 확정 후 `router.replace`, 홈 자동로그인
 * sync, 매 커밋마다 도는 마커 기록)의 흐름이 스토리지 사정으로 끊기면 로그인 불가·화면
 * 크래시로 번진다.
 *
 * 경고 로그는 세션당 1회만 남긴다 — 매 커밋마다 도는 경로가 있어 매번 찍으면 콘솔이 잠긴다.
 */
let hasWarnedStorageFailure = false;

function warnStorageFailureOnce(error: unknown): void {
  if (hasWarnedStorageFailure) return;
  hasWarnedStorageFailure = true;
  console.warn("[useListStatePersist] sessionStorage 접근 실패 — 목록 복원 비활성:", error);
}

/** sessionStorage 읽기. 접근 불가 환경에서는 null. */
export function readListStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch (error: unknown) {
    warnStorageFailureOnce(error);
    return null;
  }
}

/** sessionStorage 쓰기. 접근 불가 환경에서는 no-op. */
export function writeListStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch (error: unknown) {
    warnStorageFailureOnce(error);
  }
}

/** sessionStorage 삭제. 접근 불가 환경에서는 no-op. */
export function removeListStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch (error: unknown) {
    warnStorageFailureOnce(error);
  }
}

/* ------------------------------------------------------------------ *
 * 복원 판정 캐시
 * ------------------------------------------------------------------ */

interface ScopeDecision {
  result: boolean;
  /** 판정 시각(ms). grace window 를 넘긴 캐시는 무효로 본다. */
  at: number;
}

/**
 * scope 별 복원 판정 결과 캐시.
 *   - 같은 컴포넌트 마운트 안에서 useState lazy init 이중 호출 / 두 훅의 동일 scope 조회를
 *     같은 결과로 만들어 주는 short-lived 캐시.
 *   - 새 setListRestoreFlag 호출, popstate(새 내비게이션), useListStateCacheInvalidator
 *     (unmount 시) 호출로 무효화되고, **그와 별개로 grace window 경과 시 자동 만료**된다.
 *
 * 시간 만료가 필요한 이유: 캐시 set 은 렌더 단계에서 일어나는데 그 렌더가 커밋되지 못하는
 * 경우가 있다(권한 가드 redirect, 전환 도중 이탈). 그러면 unmount cleanup 이 영영 돌지 않고
 * push 내비게이션은 캐시를 비우지 않으므로 stale `true` 가 무기한 남아, 이후 메뉴 클릭
 * 진입에서 캐시 히트로 잘못 복원된다.
 */
const _scopeDecisionCache = new Map<ListScope, ScopeDecision>();

function getCachedDecision(scope: ListScope): boolean | undefined {
  const cached = _scopeDecisionCache.get(scope);
  if (!cached) return undefined;
  if (Date.now() - cached.at > STRICT_MODE_REMOUNT_GRACE_MS) {
    _scopeDecisionCache.delete(scope);
    return undefined;
  }
  return cached.result;
}

function setCachedDecision(scope: ListScope, result: boolean): void {
  _scopeDecisionCache.set(scope, { result, at: Date.now() });
}

/**
 * 상세/생성/편집 페이지에서 목록 라우트로 router.push 하기 직전 호출.
 * 다음 목록 마운트에서 sessionStorage 검색조건/페이지 표시 개수가 복원되도록 플래그 설정.
 * scope 캐시를 invalidate 하여 다음 consumeListRestore 가 새로 평가하도록 한다.
 */
export function setListRestoreFlag(scope: ListScope): void {
  if (typeof window === "undefined") return;
  writeListStorage(LIST_RESTORE_KEYS[scope].flag, "1");
  _scopeDecisionCache.delete(scope);
}

/** 플래그가 "1" 이면 true 반환 + sessionStorage 에서 삭제. */
function consumeListRestoreFlag(scope: ListScope): boolean {
  const key = LIST_RESTORE_KEYS[scope].flag;
  if (readListStorage(key) !== "1") return false;
  removeListStorage(key);
  return true;
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

/* ------------------------------------------------------------------ *
 * history entry 마커
 * ------------------------------------------------------------------ */

/**
 * 브라우저 뒤로/앞으로 복원용 history entry 마커 키.
 * Next.js App Router 는 자체 내부 키(`__NA`, `__PRIVATE_NEXTJS_INTERNALS_TREE`)를 history.state
 * 에 보관하므로, 기존 state 를 spread 해 내부 키를 보존한 채 본 키만 덧붙인다.
 */
const HISTORY_MARKER_KEY = "__qpListRestore";

/** 충돌 가능성이 사실상 없는 랜덤 id. crypto.randomUUID 미지원 환경은 시간+난수로 폴백. */
function generateUniqueId(): string {
  const cryptoObj = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 문서(document) 단위 식별자 — 모듈 평가 시 1회 생성.
 * 새로고침하면 모듈이 재평가되어 새 값이 되므로, 이전 문서에서 심어둔 마커는 불일치로 무시된다.
 * ("새로고침 = 검색조건 초기화" 정책 유지. 뒤로가기는 같은 문서 내 SPA 이동이라 값이 유지된다.)
 *
 * 로그아웃은 SPA 전환(router.replace)이라 문서가 유지되므로, resetListRestoreState() 로
 * 이 값을 새로 발급해 계정 전환 이후 이전 사용자의 마커가 매칭되지 않도록 한다.
 */
let documentId = generateUniqueId();

interface HistoryMarker {
  scope: ListScope;
  docId: string;
}

/** history.state 값에서 마커를 안전하게 읽는다. 형식이 다르면 null. */
function parseHistoryMarker(state: unknown): HistoryMarker | null {
  if (!state || typeof state !== "object") return null;
  const raw: unknown = (state as Record<string, unknown>)[HISTORY_MARKER_KEY];
  if (!raw || typeof raw !== "object") return null;
  const { scope, docId } = raw as Record<string, unknown>;
  // `in` 은 프로토타입 체인 키("toString" 등)까지 통과시키므로 Object.hasOwn 으로 판정한다.
  if (typeof scope !== "string" || !Object.hasOwn(LIST_RESTORE_KEYS, scope)) return null;
  if (typeof docId !== "string") return null;
  return { scope: scope as ListScope, docId };
}

/**
 * 직전 popstate(브라우저 뒤로/앞으로)로 **도착한** entry 의 마커.
 *
 * 마커를 렌더 단계에서 `window.history.state` 로 직접 읽으면 안 된다 — Next.js App Router 는
 * `HistoryUpdater` 의 useInsertionEffect(커밋 단계)에서 pushState 를 수행하므로, 클라이언트
 * 네비게이션으로 목록이 새로 마운트되는 렌더 시점의 history.state 는 아직 **출발 entry** 의
 * 것이다. 그 값을 믿으면 "메뉴 클릭 = 초기화" 정책이 깨진다.
 *
 * popstate 는 뒤로/앞으로에서만 발생하고 push/replace 에서는 발생하지 않으며, 이벤트 시점의
 * history.state 는 이미 도착 entry 의 것이다. 따라서 popstate 에서 값을 떠 두고 복원 판정은
 * 이 값만 사용한다.
 */
let poppedMarker: HistoryMarker | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    poppedMarker = parseHistoryMarker(window.history.state);
    // 새 내비게이션이므로 직전 마운트의 판정 결과를 재사용하면 안 된다.
    _scopeDecisionCache.clear();
  });
}

/**
 * 목록 화면의 현재 history entry 에 복원 마커를 심는다 (Redmine #2490).
 *
 * 상세 화면 진입은 `router.push` = 새 history entry 이므로 마커가 없고, 브라우저 뒤로가기는
 * 마커가 남아있는 목록 entry 로 복귀한다. 따라서 "뒤로가기 복귀" 와 "메뉴 클릭/새 진입" 을
 * 구분할 수 있다 — sessionStorage 플래그만으로는 불가능했던 판정이다.
 *
 * `ownedPath` 는 이 컴포넌트가 마운트된 시점의 pathname 이다. 목록→목록 전환처럼 이탈
 * 페이지가 계속 마운트된 상태에서 한 번 더 커밋되면 도착 entry 에 출발 목록의 scope 가
 * 찍히므로, 경로가 달라진 뒤의 커밋은 무시한다.
 *
 * 이미 같은 scope/문서의 마커가 있으면 no-op 이므로 매 커밋마다 호출해도 안전하다.
 */
function markListHistoryEntry(scope: ListScope, ownedPath: string): void {
  if (typeof window === "undefined") return;
  if (ownedPath !== window.location.pathname) return;

  const state: unknown = window.history.state;
  const current = parseHistoryMarker(state);
  if (current !== null && current.scope === scope && current.docId === documentId) return;

  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  try {
    // url 인자는 생략 — 현재 URL 을 그대로 유지한다.
    window.history.replaceState({ ...base, [HISTORY_MARKER_KEY]: { scope, docId: documentId } }, "");
  } catch (error: unknown) {
    // Safari 등의 replaceState 호출 빈도 제한에 걸려도 복원이 안 될 뿐이므로 조용히 넘어간다.
    console.warn("[useListStatePersist] history 복원 마커 기록 실패:", error);
  }
}

/**
 * 목록 화면에서 호출 — 현재 history entry 에 복원 마커를 유지한다.
 *
 * deps 없이 매 커밋마다 재기록한다. URL 정리용 `replaceState` 처럼 state 를 통째로 덮어쓰는
 * 호출로 마커가 지워져도 곧바로 다시 심기 위해서다. 마커가 이미 있으면 내부에서 no-op.
 */
export function useListHistoryMarker(scope: ListScope): void {
  const ownedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 첫 effect 시점의 history 는 이미 도착 entry 의 것이다 — Next.js 의 HistoryUpdater 는
    // useInsertionEffect(커밋 단계, 모든 layout/passive effect 보다 앞)에서 push/replace 를
    // 끝내기 때문이다. 따라서 여기서 읽은 pathname 이 이 컴포넌트가 소유한 entry 의 경로다.
    ownedPathRef.current ??= window.location.pathname;
    markListHistoryEntry(scope, ownedPathRef.current);
  });
}

/**
 * 목록 컴포넌트 마운트 시 1회 호출 — 복원 여부를 판정한다. useState lazy init 안에서 호출 가능.
 *
 * 두 경로 중 하나라도 성립하면 true:
 *   (1) sessionStorage 플래그: 상세/생성/편집 화면의 "一覧" 버튼 등 명시적 목록 복귀.
 *   (2) popstate 로 도착한 이 entry 의 마커: 브라우저 뒤로/앞으로 복귀.
 *
 * 마커는 1회 소비한다 — 목록이 끝내 마운트되지 못해(권한 가드 redirect, 전환 도중 다른
 * 메뉴로 이탈) 소비되지 않은 티켓이 남으면, 이후 메뉴 클릭 진입이 이를 주워 "메뉴 클릭 =
 * 초기화" 정책이 깨진다. 같은 entry 로 다시 뒤로/앞으로 오면 popstate 가 다시 발생해 재설정된다.
 */
export function consumeListRestore(scope: ListScope): boolean {
  if (typeof window === "undefined") return false;
  const cached = getCachedDecision(scope);
  if (cached !== undefined) return cached;

  // popstate 티켓은 지금 렌더 중인 entry 의 history.state 와 대조해 동일 scope·문서일 때만
  // 유효 처리한다. push 로 만들어진 새 entry 의 state 에는 마커가 없으므로 자동으로 걸러진다.
  const popped = poppedMarker;
  const currentMarker = parseHistoryMarker(window.history.state);
  const isArrival =
    popped !== null &&
    popped.scope === scope &&
    popped.docId === documentId &&
    currentMarker !== null &&
    currentMarker.scope === scope &&
    currentMarker.docId === documentId;

  let result = consumeListRestoreFlag(scope);
  if (isArrival) {
    // 플래그가 먼저 성립해도 티켓은 반드시 소비한다 — 남겨두면 위의 잔존 티켓이 된다.
    poppedMarker = null;
    result = true;
  }
  setCachedDecision(scope, result);
  return result;
}

/**
 * 계정 전환 시점에 호출 — 목록 복원 상태를 전부 폐기한다.
 *
 * 로그아웃은 SPA 전환이라 문서가 유지되므로, 정리하지 않으면 같은 탭에서 다음 사용자가
 * 뒤로가기했을 때 이전 사용자의 검색조건(대량메일은 작성자 ID·이메일 포함)이 복원된다.
 *   - sessionStorage 의 모든 scope 키 삭제
 *   - documentId 재발급 → 이미 심어진 history 마커는 전부 불일치로 무시됨
 *
 * 호출 지점은 로그아웃(`performLogout`) + 로그인 확정(일반 로그인·2FA 통과·최초 로그인
 * 회원정보 설정·자동로그인 inbound sync) + 세션 만료(401 응답 인터셉터) 다.
 * 리셋은 호출된 탭에서만 동작한다 — 다른 탭에서 계정이 바뀐 경우는 대상 밖(Redmine 후속).
 */
export function resetListRestoreState(): void {
  if (typeof window === "undefined") return;
  for (const keys of Object.values(LIST_RESTORE_KEYS)) {
    for (const key of Object.values<string>(keys)) {
      removeListStorage(key);
    }
  }
  poppedMarker = null;
  _scopeDecisionCache.clear();
  documentId = generateUniqueId();
}
