"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * 로그인 사용자의 역할별 메뉴 CRUD 권한 훅.
 * 참조: `docs/ref/01-plan/rbac-menu-access-frontend.plan.md` §B
 *
 * BE `GET /api/auth/me/permissions` (§A) 소비.
 * - SUPER_ADMIN: BE 가 활성 메뉴 전체 true 합성 반환
 * - 그 외: 시드 매트릭스(QpRoleMenuPermission) 기반, 응답에 없는 menuCode 는 fail-closed(false)
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

interface MePermissionsData {
  roleCode: string;
  menus: MenuPermissionEntry[];
}

async function fetchMyPermissions(): Promise<MePermissionsData> {
  if (IS_STUB) {
    // STUB — 소비처는 IS_STUB 분기에서 all-true 반환. 빈 응답만 내려둔다.
    return { roleCode: "STUB", menus: [] };
  }
  const res = await api.get<{ data: MePermissionsData }>("/auth/me/permissions");
  return res.data.data;
}

/**
 * 주어진 menuCode 에 대한 현재 사용자의 4개 CRUD 플래그 반환.
 * - IS_STUB 동안: 모두 true + isLoading 은 실제 훅 상태 반영
 * - 운영(IS_STUB=false):
 *   · ADMIN / SUPER_ADMIN 은 fail-open (모든 menuCode 통과) — 정책: 관리자는 관리자 영역 전반에서 모든 CRUD 가능.
 *     BE 가 전체 true 합성을 내려주지만 DB menuCode(레거시 ADM_* prefix) 와 FE 상수(MEMBERS 등) 불일치 시
 *     매칭이 실패해 UI 가 먹통이 되는 것도 함께 방어.
 *   · 그 외 역할(STORE/SEKO/GENERAL): 응답의 해당 menuCode 항목을 참조, 없으면 false (fail-closed)
 */
export function useMenuPermission(menuCode: string): MenuPermission {
  const { data, isLoading } = useQuery<MePermissionsData>({
    queryKey: ["me", "permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (IS_STUB) {
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      isLoading,
    };
  }

  if (data?.roleCode === "SUPER_ADMIN" || data?.roleCode === "ADMIN") {
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
 * IS_STUB 상태: 항상 true. BE 연결 시: 응답에 없는 menuCode 는 false (fail-closed).
 */
export function useMenuPermissionMap() {
  const { data, isLoading } = useQuery<MePermissionsData>({
    queryKey: ["me", "permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const has = (menuCode: string, action: PermissionAction = "read"): boolean => {
    if (IS_STUB) return true;
    // ADMIN / SUPER_ADMIN fail-open — 정책: 관리자는 관리자 영역 전반에서 모든 CRUD 가능.
    // DB menuCode 불일치(레거시 ADM_* prefix) 로 매칭 실패해도 통과.
    if (data?.roleCode === "SUPER_ADMIN" || data?.roleCode === "ADMIN") return true;
    const entry = data?.menus.find((m) => m.menuCode === menuCode);
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
