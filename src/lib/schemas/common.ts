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

/**
 * RBAC 메뉴 코드 — DB 실제값 기준.
 * (1-Level) HOME / CONTENT / INQUIRY / MYPAGE / ADMIN
 * (2-Level, CONTENT 하위)  CONT_LIST / CONT_CREATE
 * (2-Level, INQUIRY 하위)  INQ_FORM
 * (2-Level, MYPAGE 하위)   MY_PROFILE / MY_DOWNLOAD / MY_INQUIRY
 * (2-Level, ADMIN 하위)    ADM_MEMBER / ADM_BULK_MAIL / ADM_NOTICE / ADM_CATEGORY
 *                          / ADM_PERMISSION / ADM_MENU / ADM_CODE
 *
 * Single source of truth: 여기에 추가 → seed.mjs / requireMenuPermission 양쪽 동시 반영.
 * API 경로에서는 이 enum 으로 menuCode 화이트리스트 검증하여 임의 menuCode 삽입을 차단한다.
 */
export const menuCodeValues = [
  "HOME", "CONTENT", "INQUIRY", "MYPAGE", "ADMIN",
  "CONT_LIST", "CONT_CREATE",
  "INQ_FORM",
  "MY_PROFILE", "MY_DOWNLOAD", "MY_INQUIRY",
  "ADM_MEMBER", "ADM_BULK_MAIL", "ADM_NOTICE", "ADM_CATEGORY",
  "ADM_PERMISSION", "ADM_MENU", "ADM_CODE",
] as const;

export const menuCodeSchema = z.enum(menuCodeValues);
export type MenuCode = z.infer<typeof menuCodeSchema>;

/**
 * ADMIN 제한 메뉴 — ADMIN 에게 read 만 허용하고 CUD 는 SUPER_ADMIN 전용.
 * seed 의 `ADMIN_RESTRICTED_MENUS` 와 PUT /roles/:rc/permissions 의 lockout 가드 공용.
 */
export const restrictedMenuCodes = ["ADM_PERMISSION", "ADM_MENU", "ADM_CODE"] as const;
export type RestrictedMenuCode = (typeof restrictedMenuCodes)[number];
/**
 * RESTRICTED 판정 — `updatePermissionsSchema` 에서 menuCode 가 enum 고정을 벗어나
 * 임의 문자열(신규 메뉴관리 행)까지 허용되기 때문에 `ReadonlySet<string>` 로 넓혀
 * lockout 가드 호출부(`restrictedMenuCodeSet.has(p.menuCode)`)의 타입 안전성을 유지한다.
 * 런타임 동작은 값 비교이므로 영향 없음 — RESTRICTED 3종만 true 로 떨어진다.
 */
export const restrictedMenuCodeSet: ReadonlySet<string> = new Set(restrictedMenuCodes);

/**
 * 메뉴 등록/수정 시 menuCode 의 형식 제약 — DB `qp_menus.menu_code VARCHAR(50)` 과 1:1.
 * 대문자 시작 + 대문자/숫자/언더스코어, 50자 이내.
 *
 * `menuCodeSchema` (z.enum) 는 RBAC 가드용 18개 화이트리스트 코드 검증용,
 * 본 schema 는 메뉴관리 화면에서 신규 메뉴 자유 등록 시 형식 강제용 — 용도가 다름:
 * - menuCodeSchema: 매트릭스/가드 enum (불변 코드만 허용)
 * - menuCodeFormatSchema: 메뉴 CRUD + 권한관리 PUT (사용자 자유 등록 + 형식 강제)
 *
 * 위반 케이스별로 메시지를 분리해 사용자가 어떤 부분이 잘못됐는지 즉시 인지하도록 한다 (Redmine #2164).
 * Zod chain 순서대로 issues 가 채워지므로 route handler 가 issues[0].message 만 노출해도
 * 가장 우선 위반 사유가 정확히 전달된다.
 *
 * preprocess 단계: 사용자가 소문자/혼합 케이스로 입력해도 검증 전 자동으로 대문자로 정규화.
 * UX 친화 + DB 저장값 일관성 (모든 menuCode 가 대문자) 양쪽 보장.
 */
export const menuCodeFormatSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toUpperCase() : val),
  z
    .string()
    .min(1, "メニューコードは必須です")
    .max(50, "メニューコードは50文字以内で入力してください")
    .regex(/^[A-Z]/, "メニューコードは英大文字で始めてください")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "メニューコードには英大文字・数字・アンダースコア(_)のみ使用できます",
    ),
);

/**
 * 권한(role) 등록/수정 시 roleCode 의 형식 제약 — DB `qp_roles.role_code VARCHAR(50)` 과 1:1.
 *
 * 첫 글자는 **영대문자 또는 숫자** 모두 허용 — `1ST_STORE` / `2ND_STORE` 처럼 숫자로 시작하는
 * 기존 권한 코드의 PUT(수정/활성 토글) 이 거부되지 않도록 한다 (PR #126 회귀 수정).
 * 두 번째 글자 이후도 영대문자/숫자/언더스코어만 허용하는 정책은 유지.
 *
 * `authRoleValues` (`SUPER_ADMIN` 등 6개) 는 RBAC 가드의 하드코딩 분기 식별자로 유지하되,
 * 본 schema 는 권한관리 UI 에서 신규 권한 자유 등록 + path param 검증용 (Redmine #2165).
 * 신규 등록 권한도 매트릭스 기반 RBAC 로 자동 동작 — SUPER_ADMIN/ADMIN 외는 매트릭스가 단일 진실 원천.
 *
 * 위반 케이스별로 메시지를 분리해 사용자가 어떤 부분이 잘못됐는지 즉시 인지하도록 한다.
 *
 * preprocess 단계: 사용자가 소문자/혼합 케이스로 입력해도 검증 전 자동으로 대문자로 정규화.
 * UX 친화 + DB 저장값 일관성 (모든 roleCode 가 대문자) 양쪽 보장.
 */
export const roleCodeFormatSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toUpperCase() : val),
  z
    .string()
    .min(1, "権限コードは必須です")
    .max(50, "権限コードは50文字以内で入力してください")
    .regex(/^[A-Z0-9]/, "権限コードは英大文字または数字で始めてください")
    .regex(
      /^[A-Z0-9][A-Z0-9_]*$/,
      "権限コードには英大文字・数字・アンダースコア(_)のみ使用できます",
    ),
);

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
