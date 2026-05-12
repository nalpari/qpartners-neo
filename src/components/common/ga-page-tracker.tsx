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
 *   - 민감 쿼리 파라미터(자동로그인 페이로드·비밀번호 재설정 토큰·인증 코드 등) 는
 *     sanitize 화이트리스트로 제거. page_location 도 sanitize 된 path 로 재구성해
 *     `window.location.href` 원본 전송 차단.
 *   - page_title 미전송 — 관리자 회원 상세 등에서 이름/이메일이 포함될 수 있어 제외.
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

/**
 * GA 송신 시 제거 대상 쿼리 키 (lower-case 비교).
 *
 * 자동로그인 페이로드(`autoLoginParam1`, `userTp`), 비밀번호 재설정 토큰(`token`,
 * `reset-token`), OAuth/매직링크 류(`code`, `state`, `key`), 인증/계정 식별
 * (`email`, `userid`, `pwd`, `password`) 까지 포괄. UTM/캠페인 파라미터는 화이트리스트
 * 통과하여 분석 정확도 손실 최소화.
 */
const SENSITIVE_KEYS = new Set([
  "token",
  "reset-token",
  "autologinparam1",
  "code",
  "state",
  "key",
  "pwd",
  "password",
  "email",
  "userid",
  "usertp",
]);

function sanitizeSearch(searchParams: URLSearchParams): string {
  const out = new URLSearchParams();
  searchParams.forEach((value, rawKey) => {
    const key = rawKey.toLowerCase();
    if (!SENSITIVE_KEYS.has(key)) {
      out.set(rawKey, value);
    }
  });
  return out.toString();
}

function GaPageTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 첫 마운트 page_view 는 gtag('config') 가 이미 전송 — 중복 방지 가드.
  const isInitialMountRef = useRef(true);
  // gtag 미로드 경고는 세션당 1회만 — 라우트 변경마다 로그 폭주 방지.
  const hasWarnedMissingGtagRef = useRef(false);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    if (!window.gtag) {
      if (!hasWarnedMissingGtagRef.current) {
        hasWarnedMissingGtagRef.current = true;
        console.warn(
          "[GaPageTracker] window.gtag 미정의 — gtag.js 로드 실패 가능성 (광고 차단 또는 네트워크 오류)",
        );
      }
      return;
    }

    const search = searchParams ? sanitizeSearch(searchParams) : "";
    const pagePath = search ? `${pathname}?${search}` : pathname;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      // window.location.href 원본 전송 금지 — sanitize 된 path 로 재구성.
      page_location: `${window.location.origin}${pagePath}`,
    });
  }, [pathname, searchParams]);

  return null;
}
