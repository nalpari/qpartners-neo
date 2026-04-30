"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { MenuCode } from "@/lib/schemas/common";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT } from "@/components/login/types";

/**
 * 로그인 사용자의 역할별 메뉴 CRUD 권한 훅.
 * 참조: `docs/ref/01-plan/rbac-menu-access-frontend.plan.md` §B
 *
 * BE `GET /api/auth/me/permissions` (§A) 소비.
 * - SUPER_ADMIN 포함 모든 역할: DB 매트릭스(QpRoleMenuPermission) 그대로 반영.
 *   응답에 없는 menuCode 는 fail-closed(false) — "권한관리 UI 에서 토글한 결과 즉시 반영" 원칙.
 */

/** BE 엔드포인트 연결 완료 — STUB 모드 종료 (2026-04-23) */
const IS_STUB = false;

export type PermissionAction = "read" | "create" | "update" | "delete";

export interface MenuPermission {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isLoading: boolean;
}

interface MenuPermissionEntry {
  menuCode: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * BE 응답 스키마 — `roleCode` 는 RBAC 정찰 차단 목적으로 응답에서 의도적으로 제거됨.
 * (server: `GET /api/auth/me/permissions` 의 `{ data: { menus } }` 만 노출)
 */
interface MePermissionsData {
  menus: MenuPermissionEntry[];
}

async function fetchMyPermissions(): Promise<MePermissionsData> {
  if (IS_STUB) {
    // STUB — 소비처는 IS_STUB 분기에서 all-true 반환. 빈 응답만 내려둔다.
    return { menus: [] };
  }
  const res = await api.get<{ data: MePermissionsData }>("/auth/me/permissions");
  return res.data.data;
}

/** localStorage AUTH_FLAG_KEY 구독 — 로그인 상태 변경 시 리렌더 트리거 */
function subscribeAuthFlag(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTH_FLAG_KEY) callback();
  };
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 내부 공통 쿼리 — useMenuPermission / useMenuPermissionMap 공유.
 * queryKey 는 동일하므로 TanStack Query 캐시가 자동 머지되지만, queryFn 정의 중복 제거 목적.
 *
 * 비로그인 상태에서는 쿼리를 비활성화하여 불필요한 401 응답 방지.
 * (AUTH_FLAG_KEY 로 로그인 여부를 SSR-safe 하게 판별)
 */
function useMePermissionsQuery() {
  const hasAuthFlag = useSyncExternalStore(
    subscribeAuthFlag,
    () => { try { return localStorage.getItem(AUTH_FLAG_KEY) === "1"; } catch { return false; } },
    () => false,
  );

  return useQuery<MePermissionsData>({
    queryKey: ["me", "permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: hasAuthFlag,
  });
}

/**
 * 주어진 menuCode 에 대한 현재 사용자의 4개 CRUD 플래그 반환.
 * - IS_STUB 동안: 모두 true + isLoading 은 실제 훅 상태 반영
 * - 운영(IS_STUB=false): BE /api/auth/me/permissions 응답 매트릭스 그대로 반영 (fail-closed).
 *   SUPER_ADMIN 역시 예외 없이 매트릭스 기준 — 권한관리 UI 에서 토글한 결과를 즉시 적용한다.
 */
export function useMenuPermission(menuCode: MenuCode): MenuPermission {
  const { data, isLoading } = useMePermissionsQuery();

  if (IS_STUB) {
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      isLoading,
    };
  }

  const entry = data?.menus.find((m) => m.menuCode === menuCode);
  return {
    canRead: entry?.canRead ?? false,
    canCreate: entry?.canCreate ?? false,
    canUpdate: entry?.canUpdate ?? false,
    canDelete: entry?.canDelete ?? false,
    isLoading,
  };
}

/** action 문자열로 해당 플래그 선택 — PermissionGate / onClick 가드 공용 */
export function canPerform(perm: MenuPermission, action: PermissionAction): boolean {
  switch (action) {
    case "read":
      return perm.canRead;
    case "create":
      return perm.canCreate;
    case "update":
      return perm.canUpdate;
    case "delete":
      return perm.canDelete;
  }
}

/**
 * 여러 menuCode 를 동적으로 체크해야 할 때 사용 — 단일 useQuery 캐시를 공유.
 * React hooks rule 상 loop 로 `useMenuPermission` 여러 번 호출 불가 → 이 훅으로 해결.
 *
 * 사용 예 (AdminTab 권한 기반 필터링):
 * ```tsx
 * const { has } = useMenuPermissionMap();
 * const visibleTabs = tabs.filter((t) => has(t.menuCode));
 * ```
 *
 * ### 로딩 중 정책 — `PermissionGate` 와 의도적으로 비대칭
 *
 * - `has()` (본 훅): 로딩 중 **permissive (true)**.
 *   용도: GNB/AdminTab 처럼 **대량 메뉴를 한 번에 필터** 하는 경우. 로딩 중 전체를 숨기면
 *   네비 골격이 붕괴되어 UX 가 크게 저해되므로 먼저 표시 후 데이터 수신 시 필터 교체.
 *
 * - `PermissionGate` (단건 액션 가드): 로딩 중 **fail-closed (fallback 렌더)**.
 *   용도: "수정/삭제 버튼" 등 **단건 CUD 액션**. 로딩 중 잠깐 노출했다가 숨기면 클릭 race 로
 *   권한 없는 요청이 서버로 떠나는 플래시가 발생하므로 선제 차단이 원칙.
 *
 * 두 정책 모두 **서버 가드(`requirePageMenuPermission` / `requireMenuPermission`) 가 최종
 * 방어선** 이라 보안 경계는 항상 fail-closed. FE 의 분리는 UX 최적화 범위에 한정된다.
 *
 * 데이터 로드 완료 후 응답에 없는 menuCode 는 false (fail-closed).
 *
 * `has` 인자 타입이 `string` 인 이유: AdminTab/GNB 에서 DB `/api/menus` 응답의
 * 동적 menuCode 를 바로 체크하기 때문. `MenuCode` 화이트리스트 외 코드는 자연스럽게 false 귀결.
 */
export function useMenuPermissionMap() {
  const { data, isLoading } = useMePermissionsQuery();

  const has = (menuCode: string, action: PermissionAction = "read"): boolean => {
    if (IS_STUB) return true;
    // 로딩 중에는 permissive — 서버 가드가 최종 방어선. 로딩 중 GNB 클릭 시 오탐 alert 방지.
    if (isLoading || !data) return true;
    const entry = data.menus.find((m) => m.menuCode === menuCode);
    if (!entry) return false;
    switch (action) {
      case "read":
        return entry.canRead;
      case "create":
        return entry.canCreate;
      case "update":
        return entry.canUpdate;
      case "delete":
        return entry.canDelete;
    }
  };

  return { has, isLoading };
}
