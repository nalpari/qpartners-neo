// RBAC 시드 스크립트
//
// 실행: `node prisma/seed.mjs`
// 의존: .env.local / .env.development / .env 에 DB_HOST/PORT/USER/PASSWORD/NAME 설정
//
// 기준: docs/ref/rbac 메모리 — menuCode C안(prefix 없음), 권한 매트릭스, lockout 고정.
// 반복 실행 가능 (upsert). created_at / created_by 는 보존, updated_at 만 갱신.

import * as mariadb from "mariadb";
import dotenv from "dotenv";

/**
 * .env 로딩 — `dotenv` 사용.
 * 수동 정규식 파서는 `DB_PASSWORD=P@ss#word` 처럼 값 내 `#` 이 포함되면 silent 잘림, 따옴표 내부
 * escape 처리 실패 등 인증 실패를 유발하므로 표준 라이브러리로 일원화.
 * 우선순위는 .env.local > .env.development > .env 로 유지 — 이미 세팅된 키는 override 하지 않음
 * (dotenv 기본 동작).
 */
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development" });
dotenv.config({ path: ".env" });

const REQUIRED = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
// 빈 문자열("")도 미설정 취급 — CI 가 실수로 빈 값을 export 했을 때 .env 로 fallback 하지 못해
// 접속 정보가 영구 무시되는 사고를 방지.
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");
if (missing.length > 0) {
  console.error(`[seed] DB 환경변수 누락: ${missing.join(", ")}`);
  process.exit(1);
}

// ─── 시드 데이터 ────────────────────────────────────────────────

// 1-Level 메뉴 (parentId = null)
const menus1 = [
  { menuCode: "HOME",    menuName: "ホーム",           pageUrl: "/",         sortOrder: 1 },
  { menuCode: "CONTENT", menuName: "コンテンツ",       pageUrl: "/contents", sortOrder: 2 },
  { menuCode: "INQUIRY", menuName: "お問い合わせ",     pageUrl: "/inquiry",  sortOrder: 3 },
  { menuCode: "MYPAGE",  menuName: "マイページ",       pageUrl: "/mypage",   sortOrder: 4 },
  { menuCode: "ADMIN",   menuName: "管理者",           pageUrl: "/admin",    sortOrder: 5 },
];

// 2-Level 메뉴 (parentId = ADMIN) — DB 실제값 `ADM_` prefix 사용
const menus2UnderAdmin = [
  { menuCode: "ADM_MEMBER",     menuName: "会員管理",         pageUrl: "/admin/members",     sortOrder: 1 },
  { menuCode: "ADM_BULK_MAIL",  menuName: "大量メール発送",   pageUrl: "/admin/bulk-mail",   sortOrder: 2 },
  { menuCode: "ADM_NOTICE",     menuName: "お知らせ管理",     pageUrl: "/admin/notices",     sortOrder: 3 },
  { menuCode: "ADM_CATEGORY",   menuName: "カテゴリ管理",     pageUrl: "/admin/categories",  sortOrder: 4 },
  { menuCode: "ADM_PERMISSION", menuName: "権限管理",         pageUrl: "/admin/permissions", sortOrder: 5 },
  { menuCode: "ADM_MENU",       menuName: "メニュー管理",     pageUrl: "/admin/menus",       sortOrder: 6 },
  { menuCode: "ADM_CODE",       menuName: "コード管理",       pageUrl: "/admin/codes",       sortOrder: 7 },
];

/**
 * 2-Level 메뉴 (CONTENT / INQUIRY / MYPAGE 하위) — menuCodeValues 와 DB 동기화.
 * 현재 GNB/AdminTab UI 에서 직접 표시되진 않지만 (top_nav=0, mobile=0),
 * 매트릭스 단일 진실 소스 원칙상 schema ↔ seed 불일치를 제거하기 위해 등록한다.
 * pageUrl 은 별도 페이지가 없는 섹션 메뉴는 NULL, 직접 대응 경로가 있으면 해당 경로.
 */
const menus2UnderContent = [
  { menuCode: "CONT_LIST",   menuName: "コンテンツ一覧",  pageUrl: "/contents",        sortOrder: 1 },
  { menuCode: "CONT_CREATE", menuName: "コンテンツ登録",  pageUrl: "/contents/create", sortOrder: 2 },
];
const menus2UnderInquiry = [
  { menuCode: "INQ_FORM",    menuName: "お問い合わせ",    pageUrl: "/inquiry",         sortOrder: 1 },
];
const menus2UnderMypage = [
  { menuCode: "MY_PROFILE",  menuName: "会員情報",        pageUrl: null, sortOrder: 1 },
  { menuCode: "MY_DOWNLOAD", menuName: "ダウンロード履歴", pageUrl: null, sortOrder: 2 },
  { menuCode: "MY_INQUIRY",  menuName: "お問い合わせ履歴", pageUrl: null, sortOrder: 3 },
];

// 역할 (authRole enum 과 1:1)
const roles = [
  { roleCode: "SUPER_ADMIN", roleName: "スーパー管理者",   description: "全メニュー CRUD 許可" },
  { roleCode: "ADMIN",       roleName: "管理者",           description: "管理メニュー操作可（権限・メニュー・コードの更新/削除は不可）" },
  { roleCode: "1ST_STORE",   roleName: "1次販売店",        description: "一般メニュー閲覧のみ" },
  { roleCode: "2ND_STORE",   roleName: "2次販売店",        description: "一般メニュー閲覧のみ" },
  { roleCode: "SEKO",        roleName: "施工店",           description: "一般メニュー閲覧のみ" },
  { roleCode: "GENERAL",     roleName: "一般",             description: "一般メニュー閲覧のみ" },
];

// 권한 매트릭스 분류 (2-Level 메뉴는 `ADM_` prefix)
// GENERAL_MENUS: 비관리자도 read 가능 (HOME/CONTENT/INQUIRY/MYPAGE 및 그 하위 열람 메뉴)
// ADMIN_FULL_MENUS: ADMIN 전체 CRUD — CONTENT 계열은 사내 콘텐츠 작성 권한 포함
// ADMIN_RESTRICTED_MENUS: ADMIN 은 read only, CUD 는 SUPER_ADMIN 전용
const GENERAL_MENUS = [
  "HOME", "CONTENT", "INQUIRY", "MYPAGE",
  "CONT_LIST", "INQ_FORM",
  "MY_PROFILE", "MY_DOWNLOAD", "MY_INQUIRY",
];
const ADMIN_FULL_MENUS = [
  "ADM_MEMBER", "ADM_BULK_MAIL", "ADM_NOTICE", "ADM_CATEGORY",
  "CONTENT", "CONT_LIST", "CONT_CREATE",
];
const ADMIN_RESTRICTED_MENUS = ["ADM_PERMISSION", "ADM_MENU", "ADM_CODE"];
const ALL_MENU_CODES = [
  ...menus1.map((m) => m.menuCode),
  ...menus2UnderAdmin.map((m) => m.menuCode),
  ...menus2UnderContent.map((m) => m.menuCode),
  ...menus2UnderInquiry.map((m) => m.menuCode),
  ...menus2UnderMypage.map((m) => m.menuCode),
];

// INQUIRY: 비회원 포함 전체 사용 가능 (read + create) — 모든 역할 공통 부여.
// 화면설계서 사양상 문의하기는 누구나 사용 가능한 공통 기능. 1-Level INQUIRY 와
// 2-Level INQ_FORM 모두 동일 정책 적용. update/delete 는 미구현이라 false.
const INQUIRY_OPEN_MENUS = ["INQUIRY", "INQ_FORM"];

/**
 * 역할별 메뉴 권한 매트릭스 생성.
 * - SUPER_ADMIN: 전체 메뉴 CRUD (fail-open)
 * - ADMIN:
 *   · MEMBERS / BULK_MAIL / NOTICES / CATEGORIES / CONTENT — 전체 CRUD (ADMIN_FULL_MENUS)
 *   · PERMISSIONS / MENUS / CODES — read only, create/update/delete 전부 false (ADMIN_RESTRICTED_MENUS)
 *   · INQUIRY / INQ_FORM — read + create (INQUIRY_OPEN_MENUS)
 *   · HOME / MYPAGE / ADMIN(parent) — 네비게이션용 read
 * - 1ST_STORE / 2ND_STORE / SEKO / GENERAL:
 *   · INQUIRY / INQ_FORM — read + create (INQUIRY_OPEN_MENUS)
 *   · HOME / CONTENT / MYPAGE — read only (GENERAL_MENUS)
 *   · 관리 메뉴 전체 — 모든 플래그 false
 * - Lockout: PERMISSIONS.canUpdate 는 SUPER_ADMIN 만 true. API (PUT /api/roles/:rc/permissions) 에서도
 *   상승 시도 차단하여 이중화.
 */
function buildPermissions(roleCode) {
  return ALL_MENU_CODES.map((menuCode) => {
    if (roleCode === "SUPER_ADMIN") {
      return { menuCode, canRead: true, canCreate: true, canUpdate: true, canDelete: true };
    }
    // INQUIRY / INQ_FORM — 모든 역할에 read + create 부여 (비회원 포함 전체 사용 정책)
    if (INQUIRY_OPEN_MENUS.includes(menuCode)) {
      return { menuCode, canRead: true, canCreate: true, canUpdate: false, canDelete: false };
    }
    if (roleCode === "ADMIN") {
      if (ADMIN_RESTRICTED_MENUS.includes(menuCode)) {
        return { menuCode, canRead: true, canCreate: false, canUpdate: false, canDelete: false };
      }
      if (ADMIN_FULL_MENUS.includes(menuCode)) {
        return { menuCode, canRead: true, canCreate: true, canUpdate: true, canDelete: true };
      }
      // HOME, MYPAGE, ADMIN (parent) — 네비게이션용 read
      return { menuCode, canRead: true, canCreate: false, canUpdate: false, canDelete: false };
    }
    // 비관리자: 일반 메뉴 read only, 관리 메뉴 전부 false
    if (GENERAL_MENUS.includes(menuCode)) {
      return { menuCode, canRead: true, canCreate: false, canUpdate: false, canDelete: false };
    }
    return { menuCode, canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  });
}

// ─── 실행 ──────────────────────────────────────────────────────

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2,
});

// pool.getConnection() 자체 실패 (DB down, 인증 오류, 네트워크 등) 경로를 분리.
// 실패 시 pool.end() 후 조기 종료 — 이후 transaction 블록은 실행되지 않는다.
let conn;
try {
  conn = await pool.getConnection();
} catch (err) {
  console.error("[seed] 커넥션 취득 실패:", err);
  await pool.end().catch(() => {});
  process.exit(1);
}

try {
  await conn.beginTransaction();

  /**
   * 구 menuCode cleanup — 신 `ADM_*` 체계 이전의 레거시 행을 is_active=0 으로 비활성.
   * `ON DUPLICATE KEY UPDATE` 는 menu_code(unique) 기준이므로 구 행은 절대 갱신되지 않고
   * 신규 `ADM_MEMBER` 등이 별도로 INSERT 되어 AdminTab/GNB 에 중복 탭이 렌더링되는 사고를
   * 막는다. DELETE 는 FK(qp_role_menu_permissions) 영향이 있어 soft-disable 로만 처리.
   * 멱등 — 이미 비활성이거나 행이 없으면 no-op.
   */
  console.log("[seed] 구 menuCode 비활성화 (레거시 cleanup)");
  await conn.query(
    `UPDATE qp_menus
        SET is_active = 0,
            updated_at = NOW(3)
      WHERE menu_code IN (?, ?, ?, ?, ?, ?, ?)`,
    ["MEMBERS", "BULK_MAIL", "NOTICES", "CATEGORIES", "PERMISSIONS", "MENUS", "CODES"],
  );

  console.log("[seed] 1-Level 메뉴 upsert");
  for (const m of menus1) {
    await conn.query(
      `INSERT INTO qp_menus
         (menu_code, menu_name, page_url, parent_id, sort_order, is_active, show_in_top_nav, show_in_mobile, created_at, updated_at, created_by)
       VALUES (?, ?, ?, NULL, ?, 1, 1, 1, NOW(3), NOW(3), 'SYSTEM')
       ON DUPLICATE KEY UPDATE
         menu_name = VALUES(menu_name),
         page_url = VALUES(page_url),
         parent_id = NULL,
         sort_order = VALUES(sort_order),
         is_active = 1,
         updated_at = NOW(3)`,
      [m.menuCode, m.menuName, m.pageUrl, m.sortOrder],
    );
  }

  /**
   * 1-Level 메뉴의 id 를 code 로 조회. 다음 2-Level 업서트에서 parent_id 참조.
   * 필수 parent 는 모두 existence 검증 — 누락 시 fail-fast.
   */
  const parentCodes = ["ADMIN", "CONTENT", "INQUIRY", "MYPAGE"];
  const parentRows = await conn.query(
    `SELECT menu_code, id FROM qp_menus WHERE menu_code IN (?, ?, ?, ?)`,
    parentCodes,
  );
  const parentIdByCode = new Map(parentRows.map((r) => [r.menu_code, Number(r.id)]));
  for (const code of parentCodes) {
    if (!parentIdByCode.get(code)) {
      throw new Error(`[seed] ${code} parent 메뉴 조회 실패 — 1-Level upsert가 실패한 것으로 추정`);
    }
  }

  // 2-Level 공통 업서트 유틸
  async function upsert2Level(menus, parentId) {
    for (const m of menus) {
      await conn.query(
        `INSERT INTO qp_menus
           (menu_code, menu_name, page_url, parent_id, sort_order, is_active, show_in_top_nav, show_in_mobile, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3), 'SYSTEM')
         ON DUPLICATE KEY UPDATE
           menu_name = VALUES(menu_name),
           page_url = VALUES(page_url),
           parent_id = VALUES(parent_id),
           sort_order = VALUES(sort_order),
           is_active = 1,
           updated_at = NOW(3)`,
        // ADMIN 하위만 top_nav/mobile 노출, 나머지 신규 2-Level 은 UI 숨김 (매트릭스 용도)
        [m.menuCode, m.menuName, m.pageUrl, parentId, m.sortOrder,
         parentId === parentIdByCode.get("ADMIN") ? 1 : 0,
         parentId === parentIdByCode.get("ADMIN") ? 1 : 0],
      );
    }
  }

  const adminId = parentIdByCode.get("ADMIN");
  console.log(`[seed] 2-Level 메뉴 upsert — ADMIN(${adminId}) / CONTENT / INQUIRY / MYPAGE 하위`);
  await upsert2Level(menus2UnderAdmin, adminId);
  await upsert2Level(menus2UnderContent, parentIdByCode.get("CONTENT"));
  await upsert2Level(menus2UnderInquiry, parentIdByCode.get("INQUIRY"));
  await upsert2Level(menus2UnderMypage, parentIdByCode.get("MYPAGE"));

  console.log("[seed] 역할 upsert");
  for (const r of roles) {
    await conn.query(
      `INSERT INTO qp_roles
         (role_code, role_name, description, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, 1, NOW(3), NOW(3), 'SYSTEM')
       ON DUPLICATE KEY UPDATE
         role_name = VALUES(role_name),
         description = VALUES(description),
         is_active = 1,
         updated_at = NOW(3)`,
      [r.roleCode, r.roleName, r.description],
    );
  }

  console.log("[seed] 권한 매트릭스 upsert (batch)");
  // mariadb 드라이버의 `conn.batch()` 는 한 번의 PREPARE + execute stream 으로 모든 행을 전송.
  // Promise.all + conn.query 는 connectionLimit 내 다른 커넥션으로 분기되어 현재 트랜잭션 밖에서
  // 실행될 위험이 있으므로 반드시 batch 사용.
  const permissionRows = roles.flatMap((r) =>
    buildPermissions(r.roleCode).map((p) => [
      r.roleCode,
      p.menuCode,
      p.canRead ? 1 : 0,
      p.canCreate ? 1 : 0,
      p.canUpdate ? 1 : 0,
      p.canDelete ? 1 : 0,
    ]),
  );
  await conn.batch(
    `INSERT INTO qp_role_menu_permissions
       (role_code, menu_code, can_read, can_create, can_update, can_delete, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3), 'SYSTEM')
     ON DUPLICATE KEY UPDATE
       can_read = VALUES(can_read),
       can_create = VALUES(can_create),
       can_update = VALUES(can_update),
       can_delete = VALUES(can_delete),
       updated_at = NOW(3)`,
    permissionRows,
  );
  const permCount = permissionRows.length;

  await conn.commit();
  const menuCount = menus1.length
    + menus2UnderAdmin.length + menus2UnderContent.length
    + menus2UnderInquiry.length + menus2UnderMypage.length;
  console.log(
    `[seed] 완료 — 메뉴 ${menuCount}건, 역할 ${roles.length}건, 권한 ${permCount}건`,
  );
} catch (err) {
  // rollback 자체가 throw 할 수 있으므로 (connection dead 등) 방어하여 원본 err 보존.
  await conn.rollback().catch((rollbackErr) => {
    console.error("[seed] rollback 실패:", rollbackErr);
  });
  console.error("[seed] 실패 (rollback 시도 완료):", err);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
