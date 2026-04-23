"use client";

import { useMenuPermission, canPerform, type PermissionAction } from "@/hooks/use-menu-permission";
import type { MenuCode } from "@/lib/schemas/common";

interface PermissionGateProps {
  /** 검사할 메뉴 코드 — `menuCodeValues` 화이트리스트 내에서만 허용. */
  menuCode: MenuCode;
  /** 검사할 CRUD 액션 — 미지정 시 `read` */
  action?: PermissionAction;
  /** 권한 없을 때 대체 렌더 — 미지정 시 null (숨김) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 선언적 권한 렌더 가드.
 * 참조: `docs/ref/01-plan/rbac-menu-access-frontend.plan.md` §C
 *
 * 사용 예:
 * ```tsx
 * <PermissionGate menuCode="MENU_MEMBERS" action="create" fallback={null}>
 *   <Button>新規登録</Button>
 * </PermissionGate>
 * ```
 *
 * 로딩 중에는 `fallback` 렌더 (fail-closed 기본) — `useMenuPermission` 이
 * STUB 모드일 땐 isLoading 이 사실상 무의미하게 true 허용으로 귀결.
 */
export function PermissionGate({
  menuCode,
  action = "read",
  fallback = null,
  children,
}: PermissionGateProps) {
  const perm = useMenuPermission(menuCode);

  // 로딩 중: fail-closed 로 fallback 렌더 (권한 확인 전 children 노출 방지)
  if (perm.isLoading) return <>{fallback}</>;

  const allowed = canPerform(perm, action);
  return <>{allowed ? children : fallback}</>;
}
