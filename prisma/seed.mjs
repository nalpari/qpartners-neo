// RBAC 시드 스크립트
//
// 실행: `node prisma/seed.mjs`
// 의존: .env.local / .env.development / .env 에 DB_HOST/PORT/USER/PASSWORD/NAME 설정
//
// 기준: docs/ref/rbac 메모리 — menuCode C안(prefix 없음), 권한 매트릭스, lockout 고정.
// 반복 실행 가능 (upsert). created_at / created_by 는 보존, updated_at 만 갱신.

import * as mariadb from "mariadb";
import fs from "node:fs";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n#]*)"?\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv(".env.local");
loadEnv(".env.development");
loadEnv(".env");

const REQUIRED = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = REQUIRED.filter((k) => !process.env[k]);
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

// 2-Level 메뉴 (parentId = ADMIN)
const menus2UnderAdmin = [
  { menuCode: "MEMBERS",     menuName: "会員管理",         pageUrl: "/admin/members",     sortOrder: 1 },
  { menuCode: "BULK_MAIL",   menuName: "大量メール発送",   pageUrl: "/admin/bulk-mail",   sortOrder: 2 },
  { menuCode: "NOTICES",     menuName: "お知らせ管理",     pageUrl: "/admin/notices",     sortOrder: 3 },
  { menuCode: "CATEGORIES",  menuName: "カテゴリ管理",     pageUrl: "/admin/categories",  sortOrder: 4 },
  { menuCode: "PERMISSIONS", menuName: "権限管理",         pageUrl: "/admin/permissions", sortOrder: 5 },
  { menuCode: "MENUS",       menuName: "メニュー管理",     pageUrl: "/admin/menus",       sortOrder: 6 },
  { menuCode: "CODES",       menuName: "コード管理",       pageUrl: "/admin/codes",       sortOrder: 7 },
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

// 권한 매트릭스 분류
const GENERAL_MENUS = ["HOME", "CONTENT", "INQUIRY", "MYPAGE"];
const ADMIN_FULL_MENUS = ["MEMBERS", "BULK_MAIL", "NOTICES", "CATEGORIES", "CONTENT"];
const ADMIN_RESTRICTED_MENUS = ["PERMISSIONS", "MENUS", "CODES"];
const ALL_MENU_CODES = [
  ...menus1.map((m) => m.menuCode),
  ...menus2UnderAdmin.map((m) => m.menuCode),
];

/**
 * 역할별 메뉴 권한 매트릭스 생성.
 * - SUPER_ADMIN: 전체 메뉴 CRUD (fail-open)
 * - ADMIN:
 *   · MEMBERS / BULK_MAIL / NOTICES / CATEGORIES / CONTENT — 전체 CRUD (ADMIN_FULL_MENUS)
 *   · PERMISSIONS / MENUS / CODES — read only, create/update/delete 전부 false (ADMIN_RESTRICTED_MENUS)
 *   · HOME / INQUIRY / MYPAGE / ADMIN(parent) — 네비게이션용 read
 * - 1ST_STORE / 2ND_STORE / SEKO / GENERAL:
 *   · HOME / CONTENT / INQUIRY / MYPAGE — read only (GENERAL_MENUS)
 *   · 관리 메뉴 전체 — 모든 플래그 false
 * - Lockout: PERMISSIONS.canUpdate 는 SUPER_ADMIN 만 true. API (PUT /api/roles/:rc/permissions) 에서도
 *   상승 시도 차단하여 이중화.
 */
function buildPermissions(roleCode) {
  return ALL_MENU_CODES.map((menuCode) => {
    if (roleCode === "SUPER_ADMIN") {
      return { menuCode, canRead: true, canCreate: true, canUpdate: true, canDelete: true };
    }
    if (roleCode === "ADMIN") {
      if (ADMIN_RESTRICTED_MENUS.includes(menuCode)) {
        return { menuCode, canRead: true, canCreate: false, canUpdate: false, canDelete: false };
      }
      if (ADMIN_FULL_MENUS.includes(menuCode)) {
        return { menuCode, canRead: true, canCreate: true, canUpdate: true, canDelete: true };
      }
      // HOME, INQUIRY, MYPAGE, ADMIN (parent) — 네비게이션용 read
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

  const [adminParent] = await conn.query(`SELECT id FROM qp_menus WHERE menu_code = 'ADMIN'`);
  if (!adminParent?.id) {
    throw new Error("[seed] ADMIN parent 메뉴 조회 실패 — 1-Level upsert가 실패한 것으로 추정");
  }
  const adminId = Number(adminParent.id);

  console.log(`[seed] 2-Level 메뉴 upsert (parent_id=${adminId})`);
  for (const m of menus2UnderAdmin) {
    await conn.query(
      `INSERT INTO qp_menus
         (menu_code, menu_name, page_url, parent_id, sort_order, is_active, show_in_top_nav, show_in_mobile, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 1, 1, 1, NOW(3), NOW(3), 'SYSTEM')
       ON DUPLICATE KEY UPDATE
         menu_name = VALUES(menu_name),
         page_url = VALUES(page_url),
         parent_id = VALUES(parent_id),
         sort_order = VALUES(sort_order),
         is_active = 1,
         updated_at = NOW(3)`,
      [m.menuCode, m.menuName, m.pageUrl, adminId, m.sortOrder],
    );
  }

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

  console.log("[seed] 권한 매트릭스 upsert");
  let permCount = 0;
  for (const r of roles) {
    for (const p of buildPermissions(r.roleCode)) {
      await conn.query(
        `INSERT INTO qp_role_menu_permissions
           (role_code, menu_code, can_read, can_create, can_update, can_delete, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3), 'SYSTEM')
         ON DUPLICATE KEY UPDATE
           can_read = VALUES(can_read),
           can_create = VALUES(can_create),
           can_update = VALUES(can_update),
           can_delete = VALUES(can_delete),
           updated_at = NOW(3)`,
        [
          r.roleCode,
          p.menuCode,
          p.canRead ? 1 : 0,
          p.canCreate ? 1 : 0,
          p.canUpdate ? 1 : 0,
          p.canDelete ? 1 : 0,
        ],
      );
      permCount++;
    }
  }

  await conn.commit();
  console.log(
    `[seed] 완료 — 메뉴 ${menus1.length + menus2UnderAdmin.length}건, 역할 ${roles.length}건, 권한 ${permCount}건`,
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
