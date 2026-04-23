/**
 * 메뉴 코드 단일 진실 소스 (Single Source of Truth) — FE 편의 네임스페이스.
 *
 * - 실제 화이트리스트는 `src/lib/schemas/common.ts#menuCodeValues` (Zod enum).
 *   본 파일은 그 유니언 타입 `MenuCode` 에 `satisfies` 로 바인딩되어,
 *   오타·누락이 있으면 **컴파일 타임**에 에러로 드러나게 한다.
 *
 * - 하드코딩 문자열을 이 상수로 교체해 오타·불일치 방지.
 * - 네이밍 규약: **prefix 없음** (C안) — 2026-04-21 BE 와 합의.
 *   예: FE 키 `MEMBERS` → 값 `ADM_MEMBER` (DB 실제값).
 *
 * BE seed (RBAC plan Phase 4) 와 1:1 일치해야 함.
 * 추가/변경 시 `menuCodeValues` 와 BE seed 스크립트도 동기화 필수.
 */

import type { MenuCode } from "@/lib/schemas/common";

/** 1-Level 메뉴 코드 */
export const MENU = {
  HOME: "HOME",
  CONTENT: "CONTENT",
  INQUIRY: "INQUIRY",
  MYPAGE: "MYPAGE",
  /** 관리자 영역 — admin-tab 이 parent 판별 시 이 값을 사용 */
  ADMIN: "ADMIN",
} as const satisfies Record<string, MenuCode>;

/** 2-Level (ADMIN 하위) 메뉴 코드 — DB 실제값 `ADM_` prefix 사용 */
export const ADMIN_MENU = {
  MEMBERS: "ADM_MEMBER",
  BULK_MAIL: "ADM_BULK_MAIL",
  NOTICES: "ADM_NOTICE",
  CATEGORIES: "ADM_CATEGORY",
  PERMISSIONS: "ADM_PERMISSION",
  MENUS: "ADM_MENU",
  CODES: "ADM_CODE",
} as const satisfies Record<string, MenuCode>;
