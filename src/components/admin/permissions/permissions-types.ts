// Design Ref: §2, §3 — API 응답 타입 + boolean↔Y/N 변환 유틸

/**
 * 권한 목록 useQuery 쿼리키 SSoT (PR #130 리뷰 후속).
 * 권한관리 화면(전체 목록)과 회원수정 팝업(activeOnly=true) 가 동일 헬퍼를 사용해
 * 캐시 키 충돌·invalidate 누락 회귀를 차단한다.
 *
 * @example
 *   useQuery({ queryKey: rolesQueryKey(true), ... })
 *   queryClient.invalidateQueries({ queryKey: rolesQueryKey() }); // 모든 activeOnly variant
 */
export const rolesQueryKey = (activeOnly?: boolean) =>
  activeOnly === undefined ? (["roles"] as const) : (["roles", activeOnly] as const);

/** API 응답 권한 아이템 */
export interface RoleApiItem {
  id: number;
  roleCode: string;
  roleName: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** API 목록 응답 */
export interface RolesResponse {
  data: RoleApiItem[];
}

/** UI용 권한 아이템 */
export interface PermissionItem {
  id: string;
  roleCode: string;
  roleName: string;
  description: string;
  isActive: "Y" | "N";
  isNew?: boolean;
  editingField?: string | null;
}

// --- 변환 유틸 ---

function boolToYN(value: boolean): "Y" | "N" {
  return value ? "Y" : "N";
}

function ynToBool(value: "Y" | "N"): boolean {
  return value === "Y";
}

/** API → UI 변환 */
export function toPermissionItem(api: RoleApiItem): PermissionItem {
  return {
    id: String(api.id),
    roleCode: api.roleCode,
    roleName: api.roleName,
    description: api.description ?? "",
    isActive: boolToYN(api.isActive),
  };
}

/** 신규 행 → API 등록 body */
export function toCreateRoleBody(fields: { code: string; name: string; description: string }) {
  return {
    roleCode: fields.code,
    roleName: fields.name,
    description: fields.description || null,
    isActive: true,
  };
}

/** 기존 행 수정 → API 수정 body */
export function toUpdateRoleBody(item: PermissionItem) {
  return {
    roleName: item.roleName,
    description: item.description || null,
    isActive: ynToBool(item.isActive),
  };
}

// --- 메뉴별 권한 설정 (permission-menu-popup) ---

/** GET /api/roles/{roleCode}/permissions — 메뉴 아이템 */
export interface MenuPermApiItem {
  menuCode: string;
  menuName: string;
  level: 1 | 2;
  hasUrl: boolean;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** GET 응답 — 1-Level 메뉴 (children 포함) */
export interface MenuPermTreeItem extends MenuPermApiItem {
  children: MenuPermApiItem[];
}

/** GET 응답 전체 */
export interface RolePermissionsResponse {
  data: {
    roleCode: string;
    roleName: string;
    menus: MenuPermTreeItem[];
  };
}

/** UI flat 행 (팝업 테이블용) */
export interface MenuPermissionRow {
  menuCode: string;
  level1: string;
  level2: string;
  pageUrl: "Y" | "";
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/** API 트리 → flat 행 변환 */
export function flattenMenuTree(menus: MenuPermTreeItem[]): MenuPermissionRow[] {
  const rows: MenuPermissionRow[] = [];
  for (const menu of menus) {
    rows.push({
      menuCode: menu.menuCode,
      level1: menu.menuName,
      level2: "",
      pageUrl: menu.hasUrl ? "Y" : "",
      read: menu.canRead,
      create: menu.canCreate,
      update: menu.canUpdate,
      delete: menu.canDelete,
    });
    for (const child of menu.children ?? []) {
      rows.push({
        menuCode: child.menuCode,
        level1: "",
        level2: child.menuName,
        pageUrl: child.hasUrl ? "Y" : "",
        read: child.canRead,
        create: child.canCreate,
        update: child.canUpdate,
        delete: child.canDelete,
      });
    }
  }
  return rows;
}

/** flat 행 → API 저장 body 변환 */
export function rowsToPermissions(rows: MenuPermissionRow[]) {
  return rows.map((r) => ({
    menuCode: r.menuCode,
    canRead: r.read,
    canCreate: r.create,
    canUpdate: r.update,
    canDelete: r.delete,
  }));
}
