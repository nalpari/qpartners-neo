"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * 관리자(/admin/*) 영역에서 일반 메뉴(/admin 외) 로 이동 시 캐시를 강제 무효화한다.
 *
 * Why:
 *   코드관리·메뉴관리 등에서 데이터를 수정한 뒤 일반 페이지로 이동하면 TanStack Query
 *   캐시 + RSC 캐시가 stale 인 채 노출되어 "수정한 값이 반영 안 됨" 사용자 보고가 반복됨.
 *
 * 단일 진입점 설계:
 *   GNB·로고·footer·페이지 내 <Link>·router.push 등 navigation 진입점이 다양해
 *   호출처마다 핸들러를 박으면 누락 위험 + 중복 코드. usePathname 의 변화를 감지하는
 *   layout 레벨 effect 하나로 모든 경로에 일괄 적용 (idempotent — 중복 호출 무해).
 *
 * 동작:
 *   1. admin 변경 영향이 있는 키만 선택적 invalidate — `["menus"]`(메뉴/권한·코드관리에서
 *      변경된 메뉴 트리), `["common-code"]`(공통코드 lookup 캐시), `["roles"]`(권한관리)
 *   2. router.refresh() — RSC + fetch 캐시 무효화 (server component 재페치)
 *
 * 선택적 무효화 이유 (Boston Code Review MEDIUM):
 *   `queryClient.invalidateQueries()` 를 인자 없이 호출하면 모든 활성 query 가 한꺼번에
 *   리페치되어 admin → 일반 전환 시 불필요한 네트워크 waterfall 이 발생한다. admin 에서
 *   변경 가능한 도메인(메뉴·코드·권한) 만 명시적으로 무효화해 부수효과 최소화.
 *
 * 비교:
 *   풀 리로드(window.location)는 React 트리 전체 unmount 로 UX 가 끊긴다.
 *   refresh() 는 URL/스크롤 유지 + 서버 데이터만 다시 가져와 SPA 흐름을 보존.
 */

// admin 변경 영향이 있는 query key prefix — 추가 시 한 곳에서 관리.
const ADMIN_INVALIDATE_KEYS = [["menus"], ["common-code"], ["roles"]] as const;

export function AdminTransitionRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  // 첫 마운트 시 prev === current 가 되어 아래 가드로 자연 스킵된다 (렌더 직후 false-positive 방지).
  const prevPathRef = useRef<string | null>(pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === pathname) return;

    const wasAdmin = prev?.startsWith("/admin") ?? false;
    const isAdmin = pathname?.startsWith("/admin") ?? false;
    if (!wasAdmin || isAdmin) return;

    for (const key of ADMIN_INVALIDATE_KEYS) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    router.refresh();
  }, [pathname, queryClient, router]);

  return null;
}
