/**
 * 인증 헬퍼 — 두 가지 인증 경로 지원
 *
 * 1) X-User-* 헤더 기반 (getUserFromHeaders) — API Gateway가 JWT를 검증 후 헤더 주입.
 *    Gateway 없이 직접 노출할 경우 반드시 JWT 검증 로직을 추가해야 한다.
 * 2) QSP 기반 권한코드 판별 (resolveAuthRole) — 로그인 시점에 QSP 응답에서 세부 권한 판별.
 */

import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import type { MenuAction, MenuCode } from "@/lib/schemas/common";
import { userTpValues, SYSTEM_ROLE_CODES } from "@/lib/schemas/common";
import { prisma } from "@/lib/prisma";
// getFallbackRole/AuthRole 은 Edge Runtime 호환을 위해 prisma 비의존 파일로 분리되어 있다.
// 이 파일은 서버 API 전용이므로 그대로 re-export 해 기존 소비처의 import 경로를 유지.
import { getFallbackRole, type AuthRole } from "@/lib/auth-role";

export { getFallbackRole };
export type { AuthRole };
type UserTp = (typeof userTpValues)[number];

/** QpRoleMenuPermission 의 CRUD boolean 필드 묶음. resolveMenuPermission 반환 타입. */
export type MenuPermission = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

const VALID_USER_TYPES = new Set<string>(userTpValues);

/**
 * roleCode 형식 검증 — schemas/common.ts roleCodeFormatSchema 와 동일 정책.
 * 6 기본 권한(SUPER_ADMIN/ADMIN/GENERAL/1ST_STORE/2ND_STORE/SEKO) + 운영자 정의
 * 추가 권한 모두 허용 (Target Dynamic from Role 후).
 *
 * 활성 여부 검증은 `resolveMenuPermission` 의 `role.isActive` 분기에서 수행 —
 * DB 단일 진실 원천 (qp_roles.is_active).
 */
const ROLE_CODE_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;

export type UserInfo = {
  userType: (typeof userTpValues)[number];
  userId: string;
  role: AuthRole;
  name?: string;
  department?: string;
};

/** percent-encoding 된 헤더 값을 안전하게 디코딩. 잘못된 인코딩 시 원본 반환. */
function safeDecodeHeader(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    console.warn("[auth] 헤더 디코딩 실패, 원본 사용:", value.slice(0, 20));
    return value;
  }
}

/** 요청 헤더에서 사용자 정보 추출. 헤더 없으면 null (비회원). */
export function getUserFromHeaders(headers: Headers): UserInfo | null {
  const userType = headers.get("X-User-Type");
  const userId = headers.get("X-User-Id");
  const role = headers.get("X-User-Role");

  if (!userType || !userId || !role) return null;
  if (!VALID_USER_TYPES.has(userType)) return null;
  if (!ROLE_CODE_FORMAT.test(role) || role.length > 50) return null;

  const rawName = headers.get("X-User-Name");
  const rawDepartment = headers.get("X-User-Department");

  return {
    userType: userType as UserInfo["userType"],
    userId,
    role: role as AuthRole,
    name: rawName ? safeDecodeHeader(rawName) : undefined,
    department: rawDepartment ? safeDecodeHeader(rawDepartment) : undefined,
  };
}

/** 관리자 여부 (super_admin | admin) — isInternalUser와 동일 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/** 사내 사용자 여부 — isAdmin의 alias */
export const isInternalUser = isAdmin;

/** 관리자 인증 가드. 미인증 시 401, 권한 부족 시 403. */
export function requireAdmin(headers: Headers): { user: UserInfo } | NextResponse {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "管理者権限が必要です" },
      { status: 403 },
    );
  }
  return { user };
}

/**
 * SUPER_ADMIN 전용 가드. 미인증 401, ADMIN 포함 SUPER_ADMIN 이외 403.
 *
 * 용도: 권한 매트릭스 변경과 같이 ADMIN 조차 수행해서는 안 되는 상위 운영 동작.
 * `requireAdmin` 은 SUPER_ADMIN || ADMIN 둘 다 통과시키므로 이 경로 전용으로 분리한다.
 */
export function requireSuperAdmin(
  headers: Headers,
): { user: UserInfo } | NextResponse {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "スーパー管理者権限が必要です" },
      { status: 403 },
    );
  }
  return { user };
}

/**
 * 사용자·메뉴에 대한 CRUD 권한 해석 — Phase 2 RBAC 단일 진실 (Single Source).
 *
 * - 모든 역할: QpRoleMenuPermission 매트릭스 그대로 조회 (fail-closed).
 *   · 시드에 미등록인 (roleCode, menuCode) 조합 → 전부 false
 *   · 연결된 Menu 의 `isActive=false` → 전부 false
 *   · 정상 조회: canRead/canCreate/canUpdate/canDelete 반환
 *
 * SUPER_ADMIN 도 매트릭스에 따라 움직인다 — "관리자가 매트릭스에서 토글한 결과를 즉시 반영한다"
 * 는 RBAC 본연의 동작을 위함. self-lockout 위험은 PUT /api/roles/:roleCode/permissions 의
 * lockout 가드(ADM_PERMISSION.canUpdate 회수 차단 등) 가 별도로 방어한다.
 *
 * `requireMenuPermission` 가드와 `GET /api/auth/me/permissions` 양쪽에서 호출되어
 * FE/BE 권한 판정 divergence 를 원천 차단한다.
 */
export async function resolveMenuPermission(
  user: UserInfo,
  menuCode: MenuCode,
): Promise<MenuPermission> {
  const row = await prisma.qpRoleMenuPermission.findFirst({
    where: {
      roleCode: user.role,
      menuCode,
      menu: { isActive: true },
      // 비활성 권한(qp_roles.is_active=false) 회원 차단 —
      // 6 기본 권한은 마이그레이션에서 isActive=TRUE 강제, 추가 권한만 영향.
      role: { isActive: true },
    },
    select: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
  });

  if (!row) {
    return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }
  return row;
}

const MENU_ACTION_TO_KEY: Readonly<Record<MenuAction, keyof MenuPermission>> = {
  read: "canRead",
  create: "canCreate",
  update: "canUpdate",
  delete: "canDelete",
};

/**
 * 메뉴 권한 매트릭스 기반 가드 — `requireAdmin` 의 RBAC 교체판.
 *
 * 성공: `{ user }` 반환 — 호출부에서 그대로 `const { user } = auth;` 로 소비.
 * 실패:
 *   · 401 `認証が必要です` — 헤더 인증 실패
 *   · 403 `{ error }` — 매트릭스 상 해당 action 불허 (menuCode/action 은 서버 로그에만 기록)
 *
 * @example
 * const auth = await requireMenuPermission(request.headers, "CONTENT", "create");
 * if (auth instanceof NextResponse) return auth;
 * const { user } = auth;
 */
export async function requireMenuPermission(
  headers: Headers,
  menuCode: MenuCode,
  action: MenuAction,
): Promise<{ user: UserInfo } | NextResponse> {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  const perm = await resolveMenuPermission(user, menuCode);
  if (!perm[MENU_ACTION_TO_KEY[action]]) {
    console.warn(
      `[requireMenuPermission] 권한 거부 — role=${user.role}, menuCode=${menuCode}, action=${action}`,
    );
    return NextResponse.json(
      { error: "権限がありません" },
      { status: 403 },
    );
  }
  return { user };
}

/**
 * QSP 응답 기반 세부 권한코드 판별 — 로그인/비밀번호 초기화 후 자동 로그인 공용.
 *
 * GENERAL 사용자는 회원관리에서 운영자가 임의 권한 그룹을 할당할 수 있으므로,
 * QSP `authCd` 가 활성 + 비SUPER/ADMIN 권한이면 우선 채택. 그 외는 GENERAL 폴백 (fail-closed).
 *
 * 반환 타입을 string 으로 확장 — 운영자 정의 동적 권한(예: "MANAGER_A") 도 그대로 흐르도록.
 * AuthRole 6개 fixed 타입은 RBAC 가드의 hardcoded 분기 식별자로 그대로 사용 가능
 * (string 비교는 type narrowing 영향 없음).
 */
export async function resolveAuthRole(
  userTp: UserTp,
  userId: string,
  storeLvl: string | null,
  authCd: string | null = null,
): Promise<string> {
  switch (userTp) {
    case "ADMIN": {
      const entry = await prisma.codeDetail.findFirst({
        where: {
          header: { headerCode: "ADMIN_ROLE", isActive: true },
          code: userId,
          isActive: true,
        },
        select: { id: true },
      });
      return entry ? "SUPER_ADMIN" : "ADMIN";
    }
    case "STORE":
      if (storeLvl === null) {
        console.warn("[resolveAuthRole] STORE user with null storeLvl — defaulting to 2ND_STORE (최소 권한)");
        return "2ND_STORE";
      }
      if (storeLvl !== "1" && storeLvl !== "2") {
        console.error(`[resolveAuthRole] 예상하지 못한 storeLvl: "${storeLvl}" — 2ND_STORE로 처리 (최소 권한)`);
        return "2ND_STORE";
      }
      return storeLvl === "1" ? "1ST_STORE" : "2ND_STORE";
    case "SEKO":
      return "SEKO";
    default: {
      // GENERAL: 운영자가 회원관리에서 할당한 authCd 우선 채택.
      // 활성 커스텀 권한만 허용 — 시스템 기본 6개 역할(SYSTEM_ROLE_CODES) 격상 전면 차단.
      // 무효/미설정/조회 실패 시 GENERAL 폴백 (최소 권한 원칙, rules/api.md 정책).
      if (authCd) {
        try {
          const activeRoleCodes = await resolveActiveRoleCodes();
          if (activeRoleCodes.has(authCd) && !SYSTEM_ROLE_CODES.has(authCd)) {
            return authCd;
          }
          console.warn(
            `[resolveAuthRole] GENERAL authCd 무효 또는 시스템 역할 격상 차단 — GENERAL 폴백: authCd=${authCd?.slice(0, 30)}`,
          );
        } catch (error) {
          console.error("[resolveAuthRole] qpRole 활성 목록 조회 실패 — GENERAL 폴백:", error);
        }
      }
      return "GENERAL";
    }
  }
}

/**
 * 활성 권한 코드 동적 조회 — qp_roles 기반 단일 진실 원천.
 *
 * - 6 기본 권한 (isSystem=true) + 운영자 정의 활성 추가 권한 (isSystem=false AND isActive=true)
 * - JWT 검증, 게시대상 등록 검증, 회원관리 권한 변경 검증 모두 공유
 * - 프로세스 내 TTL 캐시 (60초) — 준정적 데이터이므로 per-request DB 조회 불필요.
 *   권한 변경 시 invalidateActiveRoleCache() 호출로 즉시 갱신.
 */
let _activeRoleCache: { codes: Set<string>; expiry: number } | null = null;
const ROLE_CACHE_TTL = 60_000;

export async function resolveActiveRoleCodes(): Promise<Set<string>> {
  const now = Date.now();
  if (_activeRoleCache && _activeRoleCache.expiry > now) return _activeRoleCache.codes;
  const rows = await prisma.qpRole.findMany({
    where: { isActive: true },
    select: { roleCode: true },
  });
  const codes = new Set(rows.map((r) => r.roleCode));
  _activeRoleCache = { codes, expiry: now + ROLE_CACHE_TTL };
  return codes;
}

/** 권한 변경 시 캐시 무효화 — PUT /api/roles/:roleCode, POST /api/roles 에서 호출 */
export function invalidateActiveRoleCache(): void {
  _activeRoleCache = null;
}

/**
 * 콘텐츠 접근 가능 여부 — 게시대상(roleCode) + 기간 접근제어.
 *
 * - SUPER_ADMIN/ADMIN: 모든 콘텐츠 접근 (사내 사용자)
 * - 비로그인: roleCode IS NULL (비회원 게시대상) 콘텐츠만 통과
 * - 그 외: 사용자 authRole 과 일치하는 게시대상 콘텐츠 통과
 *
 * 게시대상 시그니처는 ContentTarget 의 Prisma 모델 그대로 — `roleCode: string | null`.
 * `null = 비회원 sentinel` (qp_roles 외부, useTargetLabels.ts:15 코드 의도 보존).
 */
export function canAccessContent(
  user: UserInfo | null,
  targets: { roleCode: string | null; startAt: Date | null; endAt: Date | null }[],
): boolean {
  // 사내 사용자는 모든 콘텐츠 접근 가능
  if (user && isInternalUser(user.role)) return true;

  const userRoleCode: string | null = user ? user.role : null;

  // 게시기간 day 단위 비교 — 목록 API(contents/route, home-notices/active/route) 와 동일 기준.
  // JST 기준 오늘 자정(UTC ms) 을 명시 계산해 서버 컨테이너 TZ 의존성 제거 (Redmine #2131).
  const now = new Date();
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const todayStart = new Date(
    Math.floor((now.getTime() + JST_OFFSET_MS) / ONE_DAY_MS) * ONE_DAY_MS - JST_OFFSET_MS,
  );

  return targets.some((t) => {
    // 비로그인 사용자 → 비회원 게시대상(roleCode IS NULL)만 통과
    // 로그인 사용자 → roleCode 일치
    if (t.roleCode !== userRoleCode) return false;
    if (t.startAt && todayStart < t.startAt) return false;
    if (t.endAt && todayStart > t.endAt) return false;
    return true;
  });
}

/**
 * 작성자 SUPER_ADMIN 판정 Result 타입 — 판정값과 신뢰도를 분리 표현.
 * - `known`: ADMIN_ROLE 조회가 정상적으로 끝나 `isSuperAdmin` 값이 실제 상태를 반영
 * - `unknown`: 헤더 누락(seed 사고) 또는 DB 에러로 조회 실패 — fail-closed 로 `isSuperAdmin=true` 세팅
 *   (상위 canModifyResource 에서 ADMIN 수정 차단 / GET 응답 필드로는 프론트 버튼 숨김으로 수렴)
 */
export type AuthorSuperAdminResult = {
  isSuperAdmin: boolean;
  status: "known" | "unknown";
};

/**
 * 작성자가 슈퍼관리자인지 조회 — 신뢰도(status)와 판정값(isSuperAdmin)을 분리 반환.
 * 에러는 내부에서 흡수하고 `status: "unknown"` + fail-closed 판정값으로 수렴 — 호출부 try/catch 불필요.
 *
 * 분기 설계 (헤더 누락 vs 의도적 비활성화 구분):
 * - 헤더 자체가 존재하지 않음 → seed 누락 사고로 간주, status=unknown + isSuperAdmin=true (→ ADMIN 수정 차단)
 * - 헤더는 존재하나 `isActive=false` → 운영자의 의도적 비활성화로 간주, status=known + isSuperAdmin=false
 *   · 의도 비활성화까지 fail-closed 하면 공통코드 플래그 한 줄로 모든 ADMIN이 수정 불가 → 내부 DoS 벡터
 * - 정상 조회에서 code 미등록만 status=known + isSuperAdmin=false (실제로 슈퍼관리자가 아닌 케이스)
 * - DB 조회 실패 시 status=unknown + isSuperAdmin=true (fail-closed)
 */
export async function resolveAuthorSuperAdmin(
  resource: { userType: string; userId: string },
  tx?: Prisma.TransactionClient,
): Promise<AuthorSuperAdminResult> {
  if (resource.userType !== "ADMIN") {
    return { isSuperAdmin: false, status: "known" };
  }
  // tx 가 전달되면 트랜잭션 컨텍스트 안에서 조회 — 트랜잭션 외부 prisma 와 격리/일관성 차이가 있는
  // 케이스(예: PUT 핸들러가 같은 row 를 수정 중)에서 동일 스냅샷 보장.
  // tx 미전달 시 글로벌 prisma 사용(기존 동작 유지 — 호출부 영향 없음).
  const client = tx ?? prisma;
  try {
    // 1단계: ADMIN_ROLE 헤더 존재 확인 — isActive 는 여기서 필터링하지 않고 분기로 처리
    const header = await client.codeHeader.findFirst({
      where: { headerCode: "ADMIN_ROLE" },
      select: { id: true, isActive: true },
    });
    if (!header) {
      console.error(
        "[resolveAuthorSuperAdmin] ADMIN_ROLE 공통코드 헤더 누락 — status=unknown, fail-closed(true). seed 확인 필요",
      );
      return { isSuperAdmin: true, status: "unknown" };
    }
    if (!header.isActive) {
      // 의도적 비활성화 — 운영자가 SUPER_ADMIN 체계를 끈 상태. 모두 일반 ADMIN 으로 취급.
      return { isSuperAdmin: false, status: "known" };
    }
    // 2단계: 해당 userId가 SUPER_ADMIN으로 등록됐는지 확인
    const entry = await client.codeDetail.findFirst({
      where: { headerId: header.id, code: resource.userId, isActive: true },
      select: { id: true },
    });
    return { isSuperAdmin: entry !== null, status: "known" };
  } catch (error) {
    console.error(
      "[resolveAuthorSuperAdmin] ADMIN_ROLE 조회 실패 — status=unknown, fail-closed(true):",
      error,
    );
    return { isSuperAdmin: true, status: "unknown" };
  }
}

/**
 * 권한 판정용 boolean wrapper — canModifyResource 내부에서만 사용.
 * GET 응답 필드 세팅에는 {@link resolveAuthorSuperAdmin} 을 직접 사용해 status 도 함께 확인할 수 있게 한다.
 */
export async function isAuthorSuperAdmin(
  resource: { userType: string; userId: string },
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const result = await resolveAuthorSuperAdmin(resource, tx);
  return result.isSuperAdmin;
}

/**
 * 게시글/콘텐츠 수정/삭제 권한 — 작성자가 있는 모든 리소스 공용
 * - SUPER_ADMIN: 모든 글
 * - ADMIN: 슈퍼관리자 작성글 제외 모든 글
 * - 그 외: `{ userType, userId }` 동시 일치 시에만(본인 작성글)
 *   · userType 미비교 시 Prisma `@@index([userType, userId])` 복합키 기반이라 타입 간 userId 중복 → IDOR 여지
 *   · 공용 유틸이므로 호출 경로 의존 없이 방어적 계약 유지
 *
 * 적용 대상: Content, HomeNotice, MassMail 등 `{ userType, userId }` 를 가진 리소스
 *
 * @param tx Optional Prisma 트랜잭션 클라이언트 — 권한 검증을 동일 트랜잭션 안에서
 *   수행해야 하는 핸들러(예: PUT/DELETE 의 Serializable tx) 에서 전달.
 */
export async function canModifyResource(
  user: UserInfo,
  resource: { userType: string; userId: string },
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "ADMIN") {
    return !(await isAuthorSuperAdmin(resource, tx));
  }
  return user.userType === resource.userType && user.userId === resource.userId;
}
