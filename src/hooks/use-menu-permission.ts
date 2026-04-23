"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { MenuCode } from "@/lib/schemas/common";

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

/**
 * 내부 공통 쿼리 — useMenuPermission / useMenuPermissionMap 공유.
 * queryKey 는 동일하므로 TanStack Query 캐시가 자동 머지되지만, queryFn 정의 중복 제거 목적.
 */
function useMePermissionsQuery() {
  return useQuery<MePermissionsData>({
    queryKey: ["me", "permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
 * 로딩 중 정책: `has()` 는 true 반환(permissive). 실제 차단은 서버 가드
 * (`requirePageMenuPermission` + `requireMenuPermission`) 가 최종 방어선이며, 로딩 중 FE 에서
 * 오탐으로 alert/버튼 숨김을 일으키면 UX 가 크게 저해되기 때문.
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
