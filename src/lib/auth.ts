/**
 * 인증 헬퍼 — 두 가지 인증 경로 지원
 *
 * 1) X-User-* 헤더 기반 (getUserFromHeaders) — API Gateway가 JWT를 검증 후 헤더 주입.
 *    Gateway 없이 직접 노출할 경우 반드시 JWT 검증 로직을 추가해야 한다.
 * 2) QSP 기반 권한코드 판별 (resolveAuthRole) — 로그인 시점에 QSP 응답에서 세부 권한 판별.
 */

import { NextResponse } from "next/server";

import type { MenuAction, MenuCode } from "@/lib/schemas/common";
import { userTpValues, authRoleValues, targetTypeValues } from "@/lib/schemas/common";
import { prisma } from "@/lib/prisma";

export type AuthRole = (typeof authRoleValues)[number];
export type TargetType = (typeof targetTypeValues)[number];
type UserTp = (typeof userTpValues)[number];

/** QpRoleMenuPermission 의 CRUD boolean 필드 묶음. resolveMenuPermission 반환 타입. */
export type MenuPermission = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

const VALID_USER_TYPES = new Set<string>(userTpValues);
const VALID_ROLES = new Set<string>(authRoleValues);

export type UserInfo = {
  userType: (typeof userTpValues)[number];
  userId: string;
  role: AuthRole;
  department?: string;
};

/** 요청 헤더에서 사용자 정보 추출. 헤더 없으면 null (비회원). */
export function getUserFromHeaders(headers: Headers): UserInfo | null {
  const userType = headers.get("X-User-Type");
  const userId = headers.get("X-User-Id");
  const role = headers.get("X-User-Role");

  if (!userType || !userId || !role) return null;
  if (!VALID_USER_TYPES.has(userType)) return null;
  if (!VALID_ROLES.has(role)) return null;

  return {
    userType: userType as UserInfo["userType"],
    userId,
    role: role as AuthRole,
    department: headers.get("X-User-Department") ? decodeURIComponent(headers.get("X-User-Department")!) : undefined,
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
 * - `SUPER_ADMIN`: DB 조회 스킵, 전부 true (fail-open — /auth/me/permissions 와 동일 정책)
 * - 그 외:
 *   · 시드에 미등록인 (roleCode, menuCode) 조합 → 전부 false (fail-closed)
 *   · 연결된 Menu 의 `isActive=false` → 전부 false (fail-closed)
 *   · 정상 조회: QpRoleMenuPermission 의 canRead/canCreate/canUpdate/canDelete 반환
 *
 * `requireMenuPermission` 가드와 `GET /api/auth/me/permissions` 양쪽에서 호출되어
 * FE/BE 권한 판정 divergence 를 원천 차단한다.
 */
export async function resolveMenuPermission(
  user: UserInfo,
  menuCode: MenuCode,
): Promise<MenuPermission> {
  if (user.role === "SUPER_ADMIN") {
    return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
  }

  const row = await prisma.qpRoleMenuPermission.findFirst({
    where: {
      roleCode: user.role,
      menuCode,
      menu: { isActive: true },
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
 *   · 403 `{ error, menuCode, action }` — 매트릭스 상 해당 action 불허
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
    return NextResponse.json(
      { error: "権限がありません", menuCode, action },
      { status: 403 },
    );
  }
  return { user };
}

/** QSP 응답 기반 세부 권한코드 판별 — 로그인/비밀번호 초기화 후 자동 로그인 공용 */
export async function resolveAuthRole(
  userTp: UserTp,
  userId: string,
  storeLvl: string | null,
): Promise<AuthRole> {
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
    default:
      return "GENERAL";
  }
}

/** authRole(대문자) → ContentTarget.targetType(소문자) 매핑 */
export const AUTH_ROLE_TO_TARGET: Partial<Record<AuthRole, TargetType>> = {
  "1ST_STORE": "first_store",
  "2ND_STORE": "second_store",
  "SEKO": "seko",
  "GENERAL": "general",
};

/** 콘텐츠 접근 가능 여부 — 게시대상 + 기간 접근제어 */
export function canAccessContent(
  user: UserInfo | null,
  targets: { targetType: string; startAt: Date | null; endAt: Date | null }[],
): boolean {
  // 사내 사용자는 모든 콘텐츠 접근 가능
  if (user && isInternalUser(user.role)) return true;

  const targetType = user ? (AUTH_ROLE_TO_TARGET[user.role] ?? "non_member") : "non_member";
  const now = new Date();

  return targets.some((t) => {
    if (t.targetType !== targetType) return false;
    if (t.startAt && now < t.startAt) return false;
    if (t.endAt && now > t.endAt) return false;
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
): Promise<AuthorSuperAdminResult> {
  if (resource.userType !== "ADMIN") {
    return { isSuperAdmin: false, status: "known" };
  }
  try {
    // 1단계: ADMIN_ROLE 헤더 존재 확인 — isActive 는 여기서 필터링하지 않고 분기로 처리
    const header = await prisma.codeHeader.findFirst({
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
    const entry = await prisma.codeDetail.findFirst({
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
): Promise<boolean> {
  const result = await resolveAuthorSuperAdmin(resource);
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
 */
export async function canModifyResource(
  user: UserInfo,
  resource: { userType: string; userId: string },
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "ADMIN") {
    return !(await isAuthorSuperAdmin(resource));
  }
  return user.userType === resource.userType && user.userId === resource.userId;
}
