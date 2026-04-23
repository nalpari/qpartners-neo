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
 * import { ADMIN_MENU } from "@/lib/menu-codes";
 *
 * <PermissionGate menuCode={ADMIN_MENU.MEMBERS} action="create" fallback={null}>
 *   <Button>新規登録</Button>
 * </PermissionGate>
 * ```
 *
 * 로딩 정책: 로딩 중에는 `fallback` 렌더 (fail-closed). 서버 `requireMenuPermission` 이
 * 최종 방어선이므로 UI 상 권한 확인 전 children 이 잠깐 노출되는 플래시를 차단.
 * (GNB 대량 메뉴 필터용 `useMenuPermissionMap.has()` 는 로딩 중 permissive 이며 정책 분리.)
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
