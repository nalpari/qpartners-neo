/**
 * 권한 사용가능여부(`QpRole.isActive`) 게이트 — 세션 발급 시점의 일회성 검사.
 *
 * `middleware.ts` / `rbac-guard.ts` 는 요청마다 `QpRole.isActive` 를 재검사하지 않으므로,
 * **인증 쿠키를 발급하는 모든 경로**가 이 게이트를 통과해야 한다. 한 경로라도 빠지면
 * 관리자가 역할을 비활성화(`isActive=false`)해도 그 경로로 세션을 받을 수 있다.
 *
 * 정책(로그인 라우트 원본):
 * - 레코드 미존재 → fail-closed 차단 (DB 정합성 문제를 통과시키지 않는다)
 * - `isActive=false` → 차단
 * - 조회 실패(DB 장애) → fail-open 통과 (권한 테이블 장애로 전체 로그인 불가 방지)
 *
 * 다만 `resolveMenuPermission`(`@/lib/auth`)은 요청마다 `role.isActive` 를 재검사하므로,
 * 권한 매트릭스 가드가 걸린 API 는 이 게이트를 통과한 뒤에도 매 요청 차단된다. 이 게이트가
 * **유일한 방어선**인 곳은 매트릭스 가드가 없는 라우트(`/api/mypage/*` 등)와 페이지 진입이다.
 *
 * 사용처: `POST /api/auth/login`(SEKO·QSP), `POST /api/auth/password-reset/confirm`(SEKO·QSP)
 */

import { prisma } from "@/lib/prisma";

/**
 * QpRole 검증 대상 authRole → roleCode 매핑.
 * `SUPER_ADMIN`/`ADMIN` 은 시스템 권한이라 QpRole 관리 대상이 아니며 검증에서 제외한다.
 */
const AUTH_ROLE_TO_ROLE_CODE: Readonly<Record<string, string>> = {
  "1ST_STORE": "1ST_STORE",
  "2ND_STORE": "2ND_STORE",
  SEKO: "SEKO",
  GENERAL: "GENERAL",
};

/**
 * authRole 로부터 검증할 roleCode 를 판별한다.
 * 시스템 권한(SUPER_ADMIN/ADMIN)이면 `undefined` — 검증 대상 아님.
 * 매핑에 없는 동적 권한(authCd 기반)은 roleCode 와 authRole 이 동일하므로 그대로 사용한다.
 */
export function resolveGateRoleCode(authRole: string): string | undefined {
  return (
    AUTH_ROLE_TO_ROLE_CODE[authRole] ??
    (authRole !== "SUPER_ADMIN" && authRole !== "ADMIN" ? authRole : undefined)
  );
}

export type RoleActiveResult =
  | { active: true }
  | { active: false; message: string };

export async function checkRoleActive(
  roleCode: string,
  logPrefix: string,
  context?: Record<string, string>,
): Promise<RoleActiveResult> {
  try {
    const role = await prisma.qpRole.findUnique({
      where: { roleCode },
      select: { isActive: true },
    });
    if (role === null) {
      console.error(`${logPrefix} QpRole 레코드 미존재 — 차단 (fail-closed)`, {
        roleCode,
        ...context,
      });
      return { active: false, message: "権限情報が存在しないためログインできません" };
    }
    if (!role.isActive) {
      console.warn(`${logPrefix} 비활성 권한 차단`, { roleCode, ...context });
      return { active: false, message: "権限が無効のためログインできません" };
    }
    return { active: true };
  } catch (error) {
    // 조회 실패는 가용성 우선 fail-open — 로그만 남기고 통과시킨다.
    console.error(`${logPrefix} QpRole.isActive 조회 실패 — 통과 처리 (fail-open):`, error);
    return { active: true };
  }
}
