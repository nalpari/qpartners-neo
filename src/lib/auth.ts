/** 임시 인증 헬퍼 — X-User-* 헤더 기반 사용자 식별 */

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

  return {
    userType: userType as UserInfo["userType"],
    userId,
    role,
    department: headers.get("X-User-Department") ?? undefined,
  };
}

/** 사내 사용자 여부 (super_admin | admin) */
export function isInternalUser(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

/** 관리자 여부 (super_admin | admin) */
export function isAdmin(role: string): boolean {
  return role === "super_admin" || role === "admin";
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
    return user.department === content.authorDepartment;
  }
  if (user.role === "admin") {
    return user.userId === content.userId;
  }
  return false;
}
