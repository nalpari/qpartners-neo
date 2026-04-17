// Design Ref: §2, §3 — API 응답 타입 + boolean↔Y/N 변환 유틸

/** API 응답 메뉴 아이템 (boolean 기반) */
export interface MenuApiItem {
  id: number;
  parentId: number | null;
  menuCode: string;
  menuName: string;
  pageUrl: string | null;
  isActive: boolean;
  showInTopNav: boolean;
  showInMobile: boolean;
  sortOrder: number;
}

/** API 응답 1-Level 메뉴 (children 포함) */
export interface MenuTreeItem extends MenuApiItem {
  children: MenuApiItem[];
}

/** API 트리 목록 응답 */
export interface MenuTreeResponse {
  data: MenuTreeItem[];
}

/** UI용 메뉴 아이템 ("Y"/"N" 문자열 기반) */
export interface MenuItem {
  id: string;
  parentId: string | null;
  menuCode: string;
  menuName: string;
  pageUrl: string;
  isActive: "Y" | "N";
  showInTopNav: "Y" | "N";
  showInMobile: "Y" | "N";
  sortOrder: number;
}

/** 폼 상태 */
export interface MenuFormState {
  upperMenu: string;
  menuCode: string;
  menuName: string;
  pageUrl: string;
  isActive: "Y" | "N";
  showInTopNav: "Y" | "N";
  showInMobile: "Y" | "N";
}

export const EMPTY_FORM: MenuFormState = {
  upperMenu: "",
  menuCode: "",
  menuName: "",
  pageUrl: "",
  isActive: "Y",
  showInTopNav: "Y",
  showInMobile: "Y",
};

// --- 변환 유틸 ---

function boolToYN(value: boolean): "Y" | "N" {
  return value ? "Y" : "N";
}

function ynToBool(value: "Y" | "N"): boolean {
  return value === "Y";
}

/** API 메뉴 아이템 → UI 메뉴 아이템 */
export function toMenuItem(api: MenuApiItem): MenuItem {
  return {
    id: String(api.id),
    parentId: api.parentId != null ? String(api.parentId) : null,
    menuCode: api.menuCode,
    menuName: api.menuName,
    pageUrl: api.pageUrl ?? "",
    isActive: boolToYN(api.isActive),
    showInTopNav: boolToYN(api.showInTopNav),
    showInMobile: boolToYN(api.showInMobile),
    sortOrder: api.sortOrder,
  };
}

/** UI 폼 → API 등록 요청 body */
export function toCreateBody(form: MenuFormState) {
  return {
    parentId: form.upperMenu ? Number(form.upperMenu) : null,
    menuCode: form.menuCode,
    menuName: form.menuName,
    pageUrl: form.pageUrl || null,
    isActive: ynToBool(form.isActive),
    showInTopNav: ynToBool(form.showInTopNav),
    showInMobile: ynToBool(form.showInMobile),
  };
}

/** UI 폼 → API 수정 요청 body */
export function toUpdateBody(form: MenuFormState) {
  return {
    menuName: form.menuName,
    pageUrl: form.pageUrl || null,
    isActive: ynToBool(form.isActive),
    showInTopNav: ynToBool(form.showInTopNav),
    showInMobile: ynToBool(form.showInMobile),
  };
}

/** API 메뉴 아이템 → 폼 상태 변환 */
export function toFormState(api: MenuApiItem): MenuFormState {
  return {
    upperMenu: api.parentId != null ? String(api.parentId) : "",
    menuCode: api.menuCode,
    menuName: api.menuName,
    pageUrl: api.pageUrl ?? "",
    isActive: boolToYN(api.isActive),
    showInTopNav: boolToYN(api.showInTopNav),
    showInMobile: boolToYN(api.showInMobile),
  };
}
