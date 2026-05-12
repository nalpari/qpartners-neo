"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Google Analytics 4 SPA 라우팅 page_view 추적기.
 *
 * Why:
 *   `gtag('config', GA_ID)` 호출 시 첫 페이지뷰는 자동 전송되지만,
 *   Next.js App Router 의 client-side navigation(router.push·<Link> 등) 은
 *   페이지 새로고침이 없어 후속 page_view 가 누락된다. pathname/searchParams
 *   변경을 effect 로 감지해 수동 발송해야 한다.
 *
 * 동작:
 *   - 첫 마운트는 gtag('config') 가 이미 page_view 를 보냈으므로 스킵 (중복 방지)
 *   - 라우트 변경(pathname 또는 searchParams) 시마다 page_view 이벤트 발송
 *
 * 안전성:
 *   - window.gtag 존재 확인 — gtag.js 가 광고 차단/네트워크 오류로 미로드된 경우 noop
 *   - 측정 ID 미설정 환경에서는 layout 이 컴포넌트를 마운트하지 않음
 *
 * Suspense 경계:
 *   `useSearchParams` 는 Next.js App Router 에서 Suspense boundary 안에서만 사용
 *   가능하다. layout 직접 마운트 시 prerender 경고를 피하려고 외곽 export 를
 *   Suspense 로 감싼다.
 *
 * 비교:
 *   `@next/third-parties` 의 GoogleAnalytics 컴포넌트가 동일 기능을 제공하나,
 *   Next.js 16.2.0 + Turbopack 환경에서 SWC 워커 충돌(Jest worker exception)을
 *   유발하여 `next/script` + 수동 page_view 추적 패턴으로 대체.
 */
export function GaPageTracker() {
  return (
    <Suspense fallback={null}>
      <GaPageTrackerInner />
    </Suspense>
  );
}

function GaPageTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 첫 마운트 page_view 는 gtag('config') 가 이미 전송 — 중복 방지 가드.
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (typeof window === "undefined" || !window.gtag) return;

    const search = searchParams?.toString();
    const pagePath = search ? `${pathname}?${search}` : pathname;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
