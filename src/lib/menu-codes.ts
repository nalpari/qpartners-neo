/**
 * 메뉴 코드 단일 진실 소스 (Single Source of Truth).
 *
 * - BE 와의 계약 menuCode 를 FE 전역에서 참조할 때 사용.
 * - 하드코딩 문자열을 이 상수로 교체해 오타·불일치 방지.
 * - 네이밍 규약: **prefix 없음** (C안) — 2026-04-21 BE 와 합의.
 *   예: `MEMBERS` (O), `MENU_MEMBERS` (X)
 *
 * BE seed (RBAC plan Phase 4) 와 1:1 일치해야 함.
 * 변경 시 BE 시드 스크립트도 동기화 필수.
 */

/** 1-Level 메뉴 코드 */
export const MENU = {
  HOME: "HOME",
  CONTENT: "CONTENT",
  INQUIRY: "INQUIRY",
  MYPAGE: "MYPAGE",
  /** 관리자 영역 — admin-tab 이 parent 판별 시 이 값을 사용 */
  ADMIN: "ADMIN",
} as const;

/** 2-Level (ADMIN 하위) 메뉴 코드 */
export const ADMIN_MENU = {
  MEMBERS: "MEMBERS",
  BULK_MAIL: "BULK_MAIL",
  NOTICES: "NOTICES",
  CATEGORIES: "CATEGORIES",
  PERMISSIONS: "PERMISSIONS",
  MENUS: "MENUS",
  CODES: "CODES",
} as const;

/** 전체 menuCode 유니언 타입 — useMenuPermission 인자 등 타입 체크용 */
export type MenuCode =
  | (typeof MENU)[keyof typeof MENU]
  | (typeof ADMIN_MENU)[keyof typeof ADMIN_MENU];
