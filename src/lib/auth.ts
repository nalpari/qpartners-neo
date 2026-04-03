/**
 * 인증 헬퍼 — 두 가지 인증 경로 지원
 *
 * 1) X-User-* 헤더 기반 (getUserFromHeaders) — API Gateway가 JWT를 검증 후 헤더 주입.
 *    Gateway 없이 직접 노출할 경우 반드시 JWT 검증 로직을 추가해야 한다.
 * 2) QSP 기반 권한코드 판별 (resolveAuthRole) — 로그인 시점에 QSP 응답에서 세부 권한 판별.
 */

import { NextResponse } from "next/server";

import { userTpValues, authRoleValues } from "@/lib/schemas/common";
import { prisma } from "@/lib/prisma";

export type AuthRole = (typeof authRoleValues)[number];
type UserTp = (typeof userTpValues)[number];

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
    department: headers.get("X-User-Department") ?? undefined,
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
const AUTH_ROLE_TO_TARGET: Record<string, string> = {
  "1ST_STORE": "first_dealer",
  "2ND_STORE": "second_dealer",
  "SEKO": "constructor",
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

/** 콘텐츠 수정 권한 — 슈퍼관리자=동일부문, 관리자=본인등록만 */
export function canModifyContent(
  user: UserInfo,
  content: { userId: string; authorDepartment: string | null },
): boolean {
  if (user.role === "SUPER_ADMIN") {
    // 부문이 양쪽 다 미지정이면 매칭하지 않음 (명시적 부문 필요)
    if (!user.department || !content.authorDepartment) return false;
    return user.department === content.authorDepartment;
  }
  if (user.role === "ADMIN") {
    return user.userId === content.userId;
  }
  return false;
}
