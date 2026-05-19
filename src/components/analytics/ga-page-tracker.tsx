"use client";

/**
 * GA4 SPA page_view manual 발송 컴포넌트.
 *
 * Why:
 *   GA4 Enhanced Measurement 의 "Page changes based on browser history events" 자동 발송은
 *   SDK 내부에서 페이지 ready (window.load / readyState=complete 등) 까지 대기한 후
 *   collect 를 dispatch 한다. dev 서버처럼 RSC chunks 다운로드 + 비동기 작업으로
 *   ready 시점이 늦으면 자동 발송도 5초 이상 지연된다 (페이지 paint 는 이미 끝났음에도).
 *
 *   본 컴포넌트는 `usePathname` / `useSearchParams` 변경을 감지해 hydration 직후 즉시
 *   `gtag('event','page_view',...)` 를 발송 — ready 대기 없이 navigation 시점과 거의 동시
 *   dispatch 한다.
 *
 * Why 자동 발송 OFF 가 prerequisite:
 *   자동 발송과 manual 발송을 동시에 켜면 모든 SPA navigation 이 2 배 카운트된다
 *   (Redmine #2216 사고). 본 컴포넌트는 다음 두 가지가 반드시 OFF 된 상태에서만 mount:
 *     1) `gtag('config', GA_ID, { send_page_view: false })` — 첫 페이지 자동 발송 차단
 *        → `src/app/layout.tsx` 의 inline init script 에서 설정.
 *     2) GA4 Property dashboard → Data Streams → Web stream → Enhanced Measurement →
 *        "Page changes based on browser history events" 토글 OFF — SPA history 자동 발송 차단.
 *
 *   코드 PR 머지와 dashboard 설정 변경은 동시 적용해야 한다. 한쪽만 OFF 면:
 *     - dashboard 만 OFF + 코드 미배포 → page_view 0 건
 *     - dashboard ON + 코드 배포 → 2 배 카운트
 *
 * Why Suspense wrap:
 *   `useSearchParams` 는 Next.js App Router 에서 Suspense boundary 안에서 사용해야
 *   prerender 시 client-side bailout 경고를 피한다. 본 컴포넌트는 root layout 에 mount
 *   되므로 prerender 영향이 layout 전체에 전파되지 않도록 자체 Suspense 로 격리한다.
 *
 * Why redirect / popup 케이스:
 *   URL bar 변경 없이 가상 페이지(예: `password-reset-popup.tsx` 의 `/login/password-reset`)
 *   를 추적하려면 본 컴포넌트가 발화하지 않으므로 popup 별로 별도 manual 발송이 필요하다.
 *   기존 패턴 유지 — 본 컴포넌트는 실제 URL navigation 만 담당.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function GaPageTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const search = searchParams.toString();
    const pagePath = search ? `${pathname}?${search}` : pathname;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: `${window.location.origin}${pagePath}`,
    });
  }, [pathname, searchParams]);

  return null;
}

export function GaPageTracker() {
  return (
    <Suspense fallback={null}>
      <GaPageTrackerInner />
    </Suspense>
  );
}
