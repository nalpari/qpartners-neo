"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * 로그인 사용자의 역할별 메뉴 CRUD 권한 훅.
 * 참조: `docs/ref/01-plan/rbac-menu-access-frontend.plan.md` §B
 *
 * ⚠️ 현재 STUB 상태 — BE `GET /api/auth/me/permissions` (§A) 미구현.
 *   `IS_STUB=true` 동안 모든 menuCode 에 대해 4 플래그 전부 true 반환 (UI 회귀 방지).
 *
 * TODO(RBAC Phase 3): BE 엔드포인트 준비되면 `IS_STUB = false` 로 변경.
 *   queryFn / 응답 shape 는 이미 BE 계약과 일치하므로 추가 수정 불필요.
 *   - 운영 시 menus 배열에 없는 menuCode → 모두 false (fail-closed)
 *   - SUPER_ADMIN 전체 true 합성은 BE 담당
 */

/** Phase 3 BE 엔드포인트가 붙기 전까지 true. 붙으면 false 로 전환 */
const IS_STUB = true;

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
 * - 운영(IS_STUB=false): 응답의 해당 menuCode 항목을 참조, 없으면 false (fail-closed)
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
