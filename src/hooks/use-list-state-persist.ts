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
 * 경고 로그는 세션당 1회만 남긴다 — collectSnapshot 이 매 커밋마다 돌기 때문에 매번 찍으면
 * 콘솔이 잠긴다.
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
 * 진입에서 캐시 히트로 잘못 복원된다. 캐시의 유효 수명은 애초에 "같은 마운트 안"(≒ 수 ms)
 * 이므로 unmount cleanup 과 동일한 grace window 로 만료시키면 이 누수가 사라진다.
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

/**
 * 내비게이션 세대 카운터 — popstate 마다 증가한다.
 *
 * 목록 컴포넌트는 마운트 시점의 세대를 기억해 두고 세대가 달라진 뒤의 커밋에서는 마킹을
 * 건너뛴다. 목록→목록 뒤로가기는 startTransition 안에서 처리되어 **이탈 페이지가 계속
 * 마운트된 상태**이므로, 그 사이 TanStack Query 백그라운드 refetch 등으로 한 번 더 커밋되면
 * 이미 바뀐 도착 entry 에 출발 목록의 scope·스냅샷을 덮어쓰게 된다.
 */
let navigationGeneration = 0;

/** 마커에 함께 실어 보내는 entry 단위 상태 스냅샷. sessionStorage 에 넣는 직렬화 문자열 그대로. */
type SnapshotField = "filters" | "pageSize" | "sort";
const SNAPSHOT_FIELDS = ["filters", "pageSize", "sort"] as const;
type ListSnapshot = Partial<Record<SnapshotField, string>>;

interface HistoryMarker {
  scope: ListScope;
  docId: string;
  /**
   * history entry 고유 id.
   * scope·docId 는 둘 다 문서 단위 값이라 같은 문서의 모든 목록 entry 가 동일한 값을 갖는다.
   * "이 티켓이 정말 지금 이 entry 의 것인가" 를 판정하려면 entry 단위 식별자가 필요하다.
   */
  entryId: string;
  /** 이 history entry 가 보여주던 검색조건/페이지크기/정렬. */
  snapshot: ListSnapshot;
}

/** scope 가 해당 필드를 쓰는 경우에만 sessionStorage 키를 반환 (bulkMail 은 sort 없음). */
function snapshotStorageKey(scope: ListScope, field: SnapshotField): string | undefined {
  const keys: Record<string, string | undefined> = LIST_RESTORE_KEYS[scope];
  return keys[field];
}

/** 현재 sessionStorage 전역 슬롯의 값을 스냅샷으로 수집. */
function collectSnapshot(scope: ListScope): ListSnapshot {
  const snapshot: ListSnapshot = {};
  for (const field of SNAPSHOT_FIELDS) {
    const key = snapshotStorageKey(scope, field);
    if (!key) continue;
    const value = readListStorage(key);
    if (value !== null) snapshot[field] = value;
  }
  return snapshot;
}

/** 스냅샷을 sessionStorage 전역 슬롯에 되돌려 놓는다 (없는 필드는 삭제 = 그 entry 엔 값이 없었음). */
function applySnapshot(scope: ListScope, snapshot: ListSnapshot): void {
  for (const field of SNAPSHOT_FIELDS) {
    const key = snapshotStorageKey(scope, field);
    if (!key) continue;
    const value = snapshot[field];
    if (typeof value === "string") {
      writeListStorage(key, value);
    } else {
      removeListStorage(key);
    }
  }
}

/** 신뢰할 수 없는 history.state 값에서 스냅샷만 안전하게 추출 — 문자열 필드만 통과. */
function parseSnapshot(raw: unknown): ListSnapshot {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const snapshot: ListSnapshot = {};
  for (const field of SNAPSHOT_FIELDS) {
    const value = source[field];
    if (typeof value === "string") snapshot[field] = value;
  }
  return snapshot;
}

/** history.state 값에서 마커를 안전하게 읽는다. 형식이 다르면 null. */
function parseHistoryMarker(state: unknown): HistoryMarker | null {
  if (!state || typeof state !== "object") return null;
  const raw: unknown = (state as Record<string, unknown>)[HISTORY_MARKER_KEY];
  if (!raw || typeof raw !== "object") return null;
  const { scope, docId, entryId, snapshot } = raw as Record<string, unknown>;
  // `in` 은 프로토타입 체인 키("toString" 등)까지 통과시키므로 Object.hasOwn 으로 판정한다.
  if (typeof scope !== "string" || !Object.hasOwn(LIST_RESTORE_KEYS, scope)) return null;
  if (typeof docId !== "string") return null;
  if (typeof entryId !== "string" || entryId === "") return null;
  return { scope: scope as ListScope, docId, entryId, snapshot: parseSnapshot(snapshot) };
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
 * history.state 는 이미 도착 entry 의 것이다. 따라서 popstate 에서 스냅샷을 떠 두고 복원
 * 판정은 이 값만 사용한다.
 */
let poppedMarker: HistoryMarker | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    poppedMarker = parseHistoryMarker(window.history.state);
    navigationGeneration += 1;
    // 새 내비게이션이므로 직전 마운트의 판정 결과를 재사용하면 안 된다.
    _scopeDecisionCache.clear();
  });
}

/**
 * 목록 컴포넌트가 소유한 history entry 의 신원.
 * 마운트 시 1회 확정하고, 이후 커밋마다 "지금 이 커밋이 여전히 내 entry 위에서 일어나는가"
 * 를 판정하는 데 쓴다.
 */
interface ListEntryIdentity {
  /** 마운트 시점의 pathname — push 로 다른 화면으로 넘어간 뒤의 늦은 커밋을 걸러낸다. */
  path: string;
  /** 마운트 시점의 내비게이션 세대 — popstate 로 entry 가 바뀐 뒤의 늦은 커밋을 걸러낸다. */
  generation: number;
  /** 이 컴포넌트가 소유한 entry 의 id. 첫 마킹에서 확정된다. */
  entryId: string | null;
}

/**
 * 목록 화면의 현재 history entry 에 복원 마커 + 상태 스냅샷을 기록한다 (Redmine #2490).
 *
 * 상세 화면 진입은 `router.push` = 새 history entry 이므로 마커가 없고, 브라우저 뒤로가기는
 * 마커가 남아있는 목록 entry 로 복귀한다. 따라서 "뒤로가기 복귀" 와 "메뉴 클릭/새 진입" 을
 * 구분할 수 있다 — sessionStorage 플래그만으로는 불가능했던 판정이다.
 *
 * 스냅샷을 history.state 에 함께 싣는 이유: sessionStorage 슬롯은 scope 당 1개뿐이라 마킹된
 * 목록 entry 가 2개 이상이면 서로의 상태를 덮어쓴다(오래된 entry 로 뒤로가면 최신 검색조건이
 * 복원되는 오동작). history.state 는 entry 단위 저장소이므로 entry↔상태가 1:1 로 맞는다.
 *
 * **다른 entry 위에는 절대 쓰지 않는다** — identity(pathname·세대·entryId) 3중 대조로 이탈
 * 후 늦게 도착한 커밋을 걸러낸다. 이 방어가 없으면 목록→목록 전환처럼 이탈 페이지가 계속
 * 마운트된 상태에서 한 번 더 커밋될 때 도착 entry 가 출발 목록의 스냅샷으로 덮여, 이 기능이
 * 지키려던 entry↔상태 1:1 이 그대로 깨진다.
 */
function markListHistoryEntry(scope: ListScope, identity: ListEntryIdentity): void {
  if (typeof window === "undefined") return;
  // 내 entry 를 떠난 뒤의 늦은 커밋 — 도착 entry 를 오염시키지 않도록 즉시 중단.
  if (identity.generation !== navigationGeneration) return;
  if (identity.path !== window.location.pathname) return;

  const state: unknown = window.history.state;
  const current = parseHistoryMarker(state);
  const currentIsOurs = current !== null && current.scope === scope && current.docId === documentId;

  // entry id 를 이미 확정했는데 현재 entry 에 다른 id 의 마커가 있으면 남의 entry 다.
  if (identity.entryId !== null && currentIsOurs && current.entryId !== identity.entryId) return;

  // 최초 마킹: 이미 내 scope 의 마커가 있으면(뒤로가기로 돌아온 entry) 그 id 를 이어받고,
  // 없으면(push 로 새로 만들어진 entry) 새 id 를 발급한다.
  const entryId = identity.entryId ?? (currentIsOurs ? current.entryId : generateUniqueId());
  identity.entryId = entryId;

  const snapshot = collectSnapshot(scope);
  if (
    currentIsOurs &&
    current.entryId === entryId &&
    JSON.stringify(current.snapshot) === JSON.stringify(snapshot)
  ) {
    return;
  }

  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  try {
    // url 인자는 생략 — 현재 URL 을 그대로 유지한다.
    window.history.replaceState(
      { ...base, [HISTORY_MARKER_KEY]: { scope, docId: documentId, entryId, snapshot } },
      "",
    );
  } catch (error: unknown) {
    // Safari 등의 replaceState 호출 빈도 제한에 걸려도 복원이 안 될 뿐이므로 조용히 넘어간다.
    console.warn("[useListStatePersist] history 복원 마커 기록 실패:", error);
  }
}

/**
 * 목록 화면에서 호출 — 현재 history entry 에 복원 마커를 유지한다.
 *
 * deps 없이 매 커밋마다 재기록한다. URL 정리용 `replaceState` 처럼 state 를 통째로 덮어쓰는
 * 호출로 마커가 지워져도 곧바로 다시 심기 위해서다. 스냅샷이 그대로면 내부에서 no-op.
 *
 * **반드시 sessionStorage 동기화 effect 들보다 뒤에 선언한다** — 같은 커밋에서 먼저 돌면
 * 한 커밋 이전의 검색조건이 스냅샷에 담긴다.
 */
export function useListHistoryMarker(scope: ListScope): void {
  const identityRef = useRef<ListEntryIdentity | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 첫 effect 시점의 history 는 이미 도착 entry 의 것이다 — Next.js 의 HistoryUpdater 는
    // useInsertionEffect(커밋 단계, 모든 layout/passive effect 보다 앞)에서 push/replace 를
    // 끝내기 때문이다. 따라서 여기서 읽은 pathname 이 이 컴포넌트가 소유한 entry 의 경로다.
    identityRef.current ??= {
      path: window.location.pathname,
      generation: navigationGeneration,
      entryId: null,
    };
    markListHistoryEntry(scope, identityRef.current);
  });
}

/**
 * 목록 컴포넌트 마운트 시 1회 호출 — 복원 여부를 판정한다. useState lazy init 안에서 호출 가능.
 *
 * 두 경로 중 하나라도 성립하면 true:
 *   (1) sessionStorage 플래그: 상세/생성/편집 화면의 "一覧" 버튼 등 명시적 목록 복귀.
 *       복원 소스는 sessionStorage 전역 슬롯(= 직전 목록 상태) 그대로.
 *   (2) popstate 로 도착한 이 entry 의 마커: 브라우저 뒤로/앞으로 복귀.
 *       복원 소스는 **그 entry 의 스냅샷** 이므로, 전역 슬롯에 먼저 되돌려 놓은 뒤 true 를 반환한다.
 *       (이후 호출부는 기존과 동일하게 sessionStorage 만 읽으면 된다.)
 *       두 경로가 동시에 성립하면 (2) 가 우선한다 — 전역 슬롯은 scope 당 1개뿐이라 entry 단위
 *       스냅샷이 항상 더 정확하다.
 *
 * 마커는 1회 소비한다 — 같은 entry 로 다시 뒤로/앞으로 오면 popstate 가 다시 발생해 재설정되고,
 * 그 외 사유의 재마운트(예: page key 변경)에서는 복원되지 않는다.
 */
export function consumeListRestore(scope: ListScope): boolean {
  if (typeof window === "undefined") return false;
  const cached = getCachedDecision(scope);
  if (cached !== undefined) return cached;

  // 마커는 "그 popstate 로 도착한 entry 전용 1회 티켓" 이다. 지금 렌더 중인 entry 의
  // history.state 와 **entry id 까지** 대조해 동일 entry 일 때만 유효 처리한다 — scope·docId
  // 는 둘 다 문서 단위 값이라 같은 문서의 모든 목록 entry 가 같은 값을 가지므로, 그 둘만으로는
  // "동일 entry" 를 판정할 수 없다. 목록이 끝내 마운트되지 못해(권한 가드 redirect, 전환 도중
  // 다른 메뉴로 이탈) 소비되지 않은 티켓이 다른 목록 entry 에서 재사용되면 "메뉴 클릭 =
  // 초기화" 정책이 깨진다. push 로 만들어진 새 entry 의 state 에는 마커가 없으므로 이 대조에서
  // 자동으로 걸러진다.
  const popped = poppedMarker;
  const currentMarker = parseHistoryMarker(window.history.state);
  const arrivalMarker =
    popped !== null &&
    popped.scope === scope &&
    popped.docId === documentId &&
    currentMarker !== null &&
    currentMarker.scope === scope &&
    currentMarker.docId === documentId &&
    currentMarker.entryId === popped.entryId
      ? popped
      : null;

  let result = consumeListRestoreFlag(scope);
  if (arrivalMarker) {
    // 플래그가 먼저 성립해도 마커는 반드시 소비한다 — 남겨두면 위의 잔존 티켓이 된다.
    applySnapshot(scope, arrivalMarker.snapshot);
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
 *   - documentId 재발급 → 이미 심어진 history 마커/스냅샷은 전부 불일치로 무시됨
 *
 * 호출 지점은 로그아웃(`performLogout`) + **로그인 확정 시점 전부** + **세션 만료(401)** 다.
 *   - 일반 로그인(`login-contents`) / 2FA 통과(`two-factor-auth-popup`)
 *   - 최초 로그인 회원정보 설정 완료(`personal-info-popup`)
 *   - 자동로그인 inbound sync(`home-main`) — 새 문서지만 sessionStorage 는 탭 단위로 잔존
 *   - 401 응답 인터셉터(`lib/axios.ts`) — 로그아웃을 거치지 않고 세션이 끊기는 경로.
 *     정리하지 않으면 사내 전용 정렬(掲示対象)이 복원 대상으로 남아, 뒤로가기할 때마다
 *     `sortTargets=true` 가 전송되어 403 으로 목록이 조회 불가 상태로 굳는다.
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
