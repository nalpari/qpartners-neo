/** 임시 인증 헬퍼 — X-User-* 헤더 기반 사용자 식별 */

import { NextResponse } from "next/server";

const VALID_USER_TYPES = new Set(["ADMIN", "DEALER", "SEKO", "GENERAL"]);

export type UserInfo = {
  userType: "ADMIN" | "DEALER" | "SEKO" | "GENERAL";
  userId: string;
  role: string;
  department?: string;
};

/** 요청 헤더에서 사용자 정보 추출. 헤더 없으면 null (비회원). */
export function getUserFromHeaders(headers: Headers): UserInfo | null {
  const userType = headers.get("X-User-Type");
  const userId = headers.get("X-User-Id");
  const role = headers.get("X-User-Role");

  if (!userType || !userId || !role) return null;
  if (!VALID_USER_TYPES.has(userType)) return null;

  return {
    userType: userType as UserInfo["userType"],
    userId,
    role,
    department: headers.get("X-User-Department") ?? undefined,
  };
}

/** 관리자 여부 (super_admin | admin) — isInternalUser와 동일 */
export function isAdmin(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

/** 사내 사용자 여부 — isAdmin의 alias */
export const isInternalUser = isAdmin;

/** 관리자 인증 가드. 미인증 시 401, 권한 부족 시 403. */
export function requireAdmin(headers: Headers): { user: UserInfo } | NextResponse {
  const user = getUserFromHeaders(headers);
  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 },
    );
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "관리자 권한이 필요합니다" },
      { status: 403 },
    );
  }
  return { user };
}

/** 콘텐츠 접근 가능 여부 — 게시대상 + 기간 접근제어 */
export function canAccessContent(
  user: UserInfo | null,
  targets: { targetType: string; startAt: Date | null; endAt: Date | null }[],
): boolean {
  // 사내 사용자는 모든 콘텐츠 접근 가능
  if (user && isInternalUser(user.role)) return true;

  const role = user?.role ?? "non_member";
  const now = new Date();

  return targets.some((t) => {
    if (t.targetType !== role) return false;
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
  if (user.role === "super_admin") {
    // undefined/null 모두 "부문 미지정"으로 동일 취급
    return (user.department ?? null) === (content.authorDepartment ?? null);
  }
  if (user.role === "admin") {
    return user.userId === content.userId;
  }
  return false;
}
