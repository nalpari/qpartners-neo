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
  // 형번관리 (검색기능 고도화 REQ-007). 여기에 없으면
  // `GET /api/auth/me/permissions` 가 응답에서 제외해(route.ts) `has()` 가 false 가 되고,
  // 관리자 탭이 조용히 사라진다 — DB 에 권한 행이 있어도 마찬가지다.
  "ADM_PRODUCT_MODEL",
] as const;

export const menuCodeSchema = z.enum(menuCodeValues);
export type MenuCode = z.infer<typeof menuCodeSchema>;

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

/**
 * 콤마 구분 양의 정수 목록 → `number[]` 변환 — URL query 공용.
 * 빈 값·비정수·0 이하는 버리고 중복은 제거한다. 값이 없으면 `undefined`
 * (= "이 필터를 쓰지 않음"). 검색 분류축·형번 선택 등 다중 id 파라미터가 공유한다.
 */
export const commaIdList = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? [
          ...new Set(
            v
              .split(",")
              .map(Number)
              .filter((n) => Number.isInteger(n) && n > 0),
          ),
        ]
      : undefined,
  );

/** 신규/수정 여부 판단 기준 (5일) */
export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * 시스템 예약 권한 코드 — 6 기본 권한. 단일 정의.
 * roles/route.ts (POST 충돌 차단), collect-recipients.ts (발송 매핑) 등에서 공유.
 */
export const SYSTEM_ROLE_CODES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN", "ADMIN", "GENERAL", "1ST_STORE", "2ND_STORE", "SEKO",
]);

/**
 * 콘텐츠 등록·수정에서 **각 1개 이상 필수**인 분류축의 `categoryCode` (2026-10-14 결정).
 *
 * 축 코드를 상수로 두지만, 소비처는 **현재 표시 중인 축에만 적용**해야 한다 —
 * 축이 폐지되면 요구가 자동으로 빠지도록. 판정 구현은 `lib/content-required-axes.ts`
 * (서버) / `contents-form.tsx` (화면).
 *
 * prisma 비의존 모듈에 둔다 — 클라이언트 컴포넌트가 import 하기 때문이다.
 */
/**
 * 콘텐츠 등록 시 **각 1개 이상** 필수인 분류축.
 *
 * `PRDST`(製品ステータス) 는 **2026-10-28 에 빠졌다** — 제품상태가 형번의 속성이 되면서
 * (REQ-007) 자료가 직접 갖는 분류가 아니게 됐다. 자료일람 표시는 연결된 형번에서
 * 파생한다(`deriveProductStatus`).
 */
export const REQUIRED_AXIS_CODES = ["INFO", "PROD"] as const;

/**
 * 제품상태(`製品ステータス`) 축 코드 — **화면에서 제외하는 레거시 축**이다.
 *
 * 제품상태는 형번의 속성이고(REQ-007), 자료일람 표시는 연결 형번에서 파생한다(REQ-005).
 * 그래서 이 카테고리 축은 역할이 없다. 그대로 두면 자료일람에 제품상태 컬럼이 **두 개**
 * 생기고(카테고리 값 + 형번 파생값) 좌측 필터·콘텐츠 등록에도 쓸모없는 항목이 남는다.
 *
 * 운영자가 카테고리 관리에서 끄게 하지 않고 **코드가 제외한다** — 운영자가 설정할 성격의
 * 항목이 아니고, 실수로 켜면 중복이 다시 생긴다. 카테고리 행과 거기 붙은 분류 데이터는
 * 지우지 않는다(되돌릴 수 있도록).
 */
export const LEGACY_PRODUCT_STATUS_AXIS_CODE = "PRDST";

/**
 * 자료종별(`資料種別`) 축 코드 — 자동완성 자료 후보의 **부제**가 이 축으로 고정이다.
 *
 * 요구사항정의서 v1.1 REQ-001 「후보 표시 형식 : [자료] 제목 + 자료종류」. 목업도
 * `sub: d.docType`(`01-search.html:2226`) 으로 이 축만 쓴다. 「값이 있는 첫 축」을
 * 쓰면 자료마다 정보종별·제품분류가 섞여 나와 후보의 의미가 흔들린다.
 *
 * 개발 DB 의 1Depth 코드는 `DATA`(표시명 `資料分類` → TO-BE `資料種別`).
 */
export const DOC_TYPE_AXIS_CODE = "DATA";
