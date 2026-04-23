import { z } from "zod";

/** QSP 사용자 유형 (ADMIN, STORE, SEKO, GENERAL) */
export const userTpValues = ["ADMIN", "STORE", "SEKO", "GENERAL"] as const;

export const userTpSchema = z.enum(userTpValues);
export type UserTp = z.infer<typeof userTpSchema>;

/** 세부 권한코드 — 프론트에서 authRole로 접근 제어 */
export const authRoleValues = [
  "SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL",
] as const;

export const authRoleSchema = z.enum(authRoleValues);

/** 콘텐츠 게시대상 유형 */
export const targetTypeValues = [
  "first_store", "second_store", "seko", "general", "non_member",
] as const;

export const targetTypeSchema = z.enum(targetTypeValues);

/**
 * RBAC 메뉴 코드 — prisma/seed.mjs 의 메뉴 시드와 1:1.
 * (1-Level) HOME / CONTENT / INQUIRY / MYPAGE / ADMIN
 * (2-Level) MEMBERS / BULK_MAIL / NOTICES / CATEGORIES / PERMISSIONS / MENUS / CODES
 *
 * Single source of truth: 여기에 추가 → seed.mjs / requireMenuPermission 양쪽 동시 반영.
 * API 경로에서는 이 enum 으로 menuCode 화이트리스트 검증하여 임의 menuCode 삽입을 차단한다.
 */
export const menuCodeValues = [
  "HOME", "CONTENT", "INQUIRY", "MYPAGE", "ADMIN",
  "MEMBERS", "BULK_MAIL", "NOTICES", "CATEGORIES",
  "PERMISSIONS", "MENUS", "CODES",
] as const;

export const menuCodeSchema = z.enum(menuCodeValues);
export type MenuCode = z.infer<typeof menuCodeSchema>;

/**
 * ADMIN 제한 메뉴 — ADMIN 에게 read 만 허용하고 CUD 는 SUPER_ADMIN 전용.
 * seed 의 `ADMIN_RESTRICTED_MENUS` 와 PUT /roles/:rc/permissions 의 lockout 가드 공용.
 */
export const restrictedMenuCodes = ["PERMISSIONS", "MENUS", "CODES"] as const;
export type RestrictedMenuCode = (typeof restrictedMenuCodes)[number];
export const restrictedMenuCodeSet: ReadonlySet<MenuCode> = new Set(restrictedMenuCodes);

/**
 * RBAC 메뉴 액션 — QpRoleMenuPermission 의 can{Read,Create,Update,Delete} 컬럼과 1:1.
 * requireMenuPermission 가드와 403 응답 바디의 `action` 필드 값으로 공용.
 */
export const menuActionValues = ["read", "create", "update", "delete"] as const;
export const menuActionSchema = z.enum(menuActionValues);
export type MenuAction = z.infer<typeof menuActionSchema>;

/** URL path parameter ID 검증 — 공통 */
export const idParamSchema = z.coerce
  .number()
  .int("IDは整数である必要があります")
  .positive("IDは正の数である必要があります");

/** 신규/수정 여부 판단 기준 (5일) */
export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
