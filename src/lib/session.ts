// 서버 컴포넌트 전용 세션 조회 유틸 — React `cache()` 로 per-request 메모이제이션.
//
// admin layout 과 하위 page 의 `requirePageMenuPermission` 가 각각 verifyToken 을 호출하면
// 동일 요청 내에서 JWT 서명 검증(jose)이 2회 실행된다. 본 헬퍼를 공용으로 사용하면
// React `cache()` 가 같은 요청 범위 내 첫 호출 결과를 캐시 — 이후 호출은 Promise 를 재사용.
//
// 사용처:
//   · `src/lib/rbac-guard.ts#requirePageMenuPermission`
//   · `src/app/admin/layout.tsx`
//
// ※ `ConfigError` (JWT_SECRET 미설정) 는 상위 error boundary 로 전파 — middleware 와 동일 규약.
// ※ 토큰 없음 / 만료 / 서명 불일치 → `null` 반환 (미인증으로 취급).

import { cache } from "react";

import { cookies } from "next/headers";

import { ConfigError } from "@/lib/errors";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import type { LoginUser } from "@/lib/schemas/auth";

export const getSessionUser = cache(async (): Promise<LoginUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    return await verifyToken(token);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    return null;
  }
});
