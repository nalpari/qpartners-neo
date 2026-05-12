"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Google Analytics 4 SPA 라우팅 page_view 추적기.
 *
 * Why:
 *   `gtag('config', GA_ID)` 자동 page_view 는 외부 스크립트 race / 라우트 전환
 *   타이밍에 따라 누락되거나 중복될 수 있어, layout 에서 `send_page_view:false`
 *   로 자동 발송을 끄고 모든 page_view 를 이 컴포넌트의 effect 에서 발송한다.
 *   첫 페이지뷰와 SPA 후속 페이지뷰가 동일 경로(이 effect) 로 일관 처리되어
 *   첫 마운트 중복 가드가 필요 없다.
 *
 * 안전성:
 *   - window.gtag 존재 확인 — gtag.js 가 광고 차단/네트워크 오류로 미로드된 경우
 *     이벤트를 큐에 보관하여 onLoad 시 일괄 발송 (race 누락 방지)
 *   - 측정 ID 미설정 환경에서는 layout 이 컴포넌트를 마운트하지 않음
 *   - 민감 쿼리 파라미터(자동로그인 페이로드·비밀번호 재설정 토큰·인증 코드 등) 는
 *     sanitize 화이트리스트로 제거. page_location 도 sanitize 된 path 로 재구성해
 *     `window.location.href` 원본 전송 차단.
 *   - 동적 라우트 segment(`/contents/123`, `/admin/bulk-mail/456` 등) 는
 *     정규화하여 회원/콘텐츠 ID enumeration 차단 (일본 個人情報保護法 보수 운영).
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
 * 카테고리:
 *   - 자동로그인 페이로드: `autologinparam*`, `userid`, `usertp`
 *   - 비밀번호 재설정/2FA: `token`, `reset-token`, `otp`, `verify`, `verification`
 *   - OAuth/매직링크: `code`, `state`, `key`, `nonce`
 *   - 액세스/세션 토큰: `access_token`, `refresh_token`, `id_token`, `jwt`,
 *     `sessionid`, `session`, `sid`, `csrf`, `_csrf`, `xsrf`
 *   - 인증/계정 식별: `email`, `pwd`, `password`
 *   - 무결성/서명: `hash`, `signature`, `sig`
 *
 * UTM/캠페인 파라미터(`utm_*`, `gclid`, `fbclid`, `ref` 등) 는 화이트리스트를
 * 통과하여 분석 정확도 손실 최소화. 추후 화이트리스트 역전이 필요할 만큼
 * 위협 표면이 커지면 별도 PR 로 전환 검토.
 */
const SENSITIVE_KEYS = new Set([
  // 비밀번호 재설정 / 2FA
  "token",
  "reset-token",
  "otp",
  "verify",
  "verification",
  // OAuth / 매직링크
  "code",
  "state",
  "key",
  "nonce",
  // 액세스 / 세션 토큰
  "access_token",
  "refresh_token",
  "id_token",
  "jwt",
  "sessionid",
  "session",
  "sid",
  "csrf",
  "_csrf",
  "xsrf",
  // 인증 / 계정 식별
  "pwd",
  "password",
  "email",
  // 자동로그인 페이로드 (param2 등 변종 대비 prefix 검사도 병행)
  "autologinparam1",
  "autologinparam2",
  "userid",
  "usertp",
  // 무결성 / 서명
  "hash",
  "signature",
  "sig",
]);

/**
 * SENSITIVE_KEYS 에 명시되지 않은 변종(예: `autoLoginParam3`, `auth_code` 등) 도
 * prefix 검사로 차단. 신규 인증 파라미터 추가 시 SENSITIVE_KEYS 등록 누락의
 * 안전망 역할.
 *
 * `auth` 만으로 prefix 검사 시 정상 query(`authorSearchType`, `authorQuery` 등
 * 작성자/저자 검색 파라미터)가 함께 차단되어 분석 손실이 크다.
 * 토큰류는 `auth_` / `auth-` 구분자 컨벤션을 따르므로 prefix 도 구분자까지 포함.
 */
const SENSITIVE_KEY_PREFIXES = ["autologinparam", "auth_", "auth-"];

function isSensitiveKey(rawKey: string): boolean {
  const key = rawKey.toLowerCase();
  if (SENSITIVE_KEYS.has(key)) return true;
  return SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function sanitizeSearch(searchParams: URLSearchParams): string {
  const out = new URLSearchParams();
  searchParams.forEach((value, rawKey) => {
    if (!isSensitiveKey(rawKey)) {
      out.set(rawKey, value);
    }
  });
  return out.toString();
}

/**
 * 동적 라우트 segment 정규화.
 *
 * `pathname` 에는 `/contents/123`, `/admin/bulk-mail/456` 처럼 순차 PK 가 그대로
 * 포함되어 GA 콘솔에서 회원/콘텐츠 ID enumeration · 비공개 콘텐츠 존재 추정 등
 * PII / 비밀 정보 누설 위험이 있다. App Router 라우트 디렉토리 구조와 동일하게
 * `[id]` placeholder 로 치환하여 차단한다.
 *
 * Prisma 스키마상 `Content.id`/`MassMail.id` 모두 `Int autoincrement` 이므로
 * 정규식을 `\d+` 로 좁혀 정적 형제 라우트(`/contents/create`,
 * `/admin/bulk-mail/create`) 가 잘못 정규화되어 funnel 분석이 왜곡되는 것을 방지.
 *
 * 신규 동적 라우트 추가 시 본 함수도 함께 갱신해야 한다 (CI 자동 검출 어려움
 * — `src/app/**\/[*]` 디렉토리 변경 시 페어 변경 권장).
 */
const DYNAMIC_ROUTE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // `/contents/[id]` 및 그 하위(`/contents/[id]/edit` 등) — `\d+` 로 숫자 ID 만 매칭.
  [/^\/contents\/\d+(?=\/|$)/, "/contents/[id]"],
  [/^\/admin\/bulk-mail\/\d+(?=\/|$)/, "/admin/bulk-mail/[id]"],
];

function normalizePathname(pathname: string): string {
  let normalized = pathname;
  for (const [pattern, replacement] of DYNAMIC_ROUTE_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

type PendingPageView = {
  pagePath: string;
  pageLocation: string;
};

function GaPageTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // gtag 미로드 경고는 세션당 1회만 — 라우트 변경마다 로그 폭주 방지.
  const hasWarnedMissingGtagRef = useRef(false);
  // gtag.js 로드 전 발생한 page_view 를 보관하는 큐. afterInteractive 전략 특성상
  // 라우트 전환이 스크립트 로드보다 빠를 수 있어 누락 방지 큐 필요.
  // 큐는 의도적으로 마지막 page_view 만 유지 — 빠른 연속 전환 시 중간 이벤트는
  // 분석상 노이즈이고 최종 도달 페이지가 측정 신뢰성에 더 중요.
  const pendingPageViewRef = useRef<PendingPageView | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = sanitizeSearch(searchParams);
    const normalizedPath = normalizePathname(pathname);
    const pagePath = search ? `${normalizedPath}?${search}` : normalizedPath;
    // window.location.href 원본 전송 금지 — sanitize / 정규화 된 path 로 재구성.
    const pageLocation = `${window.location.origin}${pagePath}`;

    if (!window.gtag) {
      // gtag.js 미로드 — 큐에 보관 후 다음 effect 호출(또는 별도 onLoad 훅)에서
      // 발송 재시도. 광고 차단 환경에서는 영구 미로드일 수 있어 1회만 경고.
      pendingPageViewRef.current = { pagePath, pageLocation };
      if (!hasWarnedMissingGtagRef.current) {
        hasWarnedMissingGtagRef.current = true;
        console.warn(
          "[GaPageTracker] window.gtag 미정의 — gtag.js 로드 실패 가능성 (광고 차단 또는 네트워크 오류)",
        );
      }
      return;
    }

    // 미발송 큐가 있으면 우선 처리 후 현재 page_view 발송.
    const pending = pendingPageViewRef.current;
    pendingPageViewRef.current = null;
    if (pending && pending.pagePath !== pagePath) {
      window.gtag("event", "page_view", {
        page_path: pending.pagePath,
        page_location: pending.pageLocation,
      });
    }

    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: pageLocation,
    });
  }, [pathname, searchParams]);

  return null;
}
