// Design Ref: §2, §3 — API 응답 타입 + boolean↔Y/N 변환 유틸

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
