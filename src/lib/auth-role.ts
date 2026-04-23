/**
 * Edge Runtime 안전 인증 헬퍼 — Prisma 의존 없음.
 *
 * `middleware.ts` 가 `@/lib/auth` 를 직접 import 하면 해당 파일의 Prisma 트리가
 * Edge bundle 로 끌려가 경고·사이즈 팽창을 유발하므로, 과도기 JWT 폴백 로직처럼
 * 순수 함수만 이 파일에 분리해 둔다.
 *
 * 매핑 기준 — `resolveAuthRole` 의 미지 값 폴백과 일치 (최소 권한 원칙):
 * - `STORE` → `2ND_STORE` : storeLvl 불명을 하위 권한으로 처리 (상위 상승 구조적 금지).
 * - `ADMIN` → `ADMIN` : ADMIN_ROLE 미조회 = 일반 ADMIN (SUPER_ADMIN 상승 차단).
 *
 * 미지의 userTp 는 `null` 반환 → fail-closed (rules/api.md: GENERAL 폴백 금지).
 *
 * middleware / requirePageMenuPermission / admin layout 공용.
 */

import { authRoleValues } from "@/lib/schemas/common";

export type AuthRole = (typeof authRoleValues)[number];

const USERTP_ROLE_MAP: Readonly<Record<string, AuthRole>> = {
  ADMIN: "ADMIN",
  STORE: "2ND_STORE",
  SEKO: "SEKO",
  GENERAL: "GENERAL",
};

export function getFallbackRole(userTp: string): AuthRole | null {
  const role = USERTP_ROLE_MAP[userTp];
  if (!role) {
    console.error("[auth-role] 미지의 userTp — 폴백 차단 (fail-closed):", userTp);
    return null;
  }
  return role;
}
