import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { QueryProvider } from "@/lib/query-provider";
import { Gnb } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Location } from "@/components/layout/location";
import { PopupController } from "@/components/common/popup-controller";
import { AlertDialog } from "@/components/common/alert-dialog";
import { AdminTransitionRefresh } from "@/components/common/admin-transition-refresh";
import { GaPageTracker } from "@/components/analytics/ga-page-tracker";
import "@/style/style.scss";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// GA 4 측정 ID — `@next/third-parties` 가 Turbopack 워커 충돌 유발하여
// `next/script` 로 직접 삽입한다. ID 는 `G-` + 대문자/숫자 8~20 자만 허용해
// 인라인 스크립트 주입 위험과 비정상 길이 입력을 차단한다.
//
// `NEXT_PUBLIC_*` 은 빌드 타임 상수이므로 모듈 스코프에서 한 번만 검증한다.
// RootLayout 내부에서 평가하면 매 요청마다 동일 정규식 평가 + 형식 불일치 시
// 서버 stdout 에 같은 warn 이 매 요청 찍혀 로그 노이즈 / 알람 영향 발생.
// 형식 불일치 시 무음 비활성화 대신 console.warn 으로 운영자가 인지 가능하게 한다.
// GA 측정 ID 는 클라이언트 번들에 노출되도록 설계된 식별자(PII 아님)이므로
// 마스킹 없이 전체 값과 길이를 로깅하여 운영자 디버깅 가능성을 확보한다.
const RAW_GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const GA_ID =
  RAW_GA_ID && /^G-[A-Z0-9]{8,20}$/.test(RAW_GA_ID) ? RAW_GA_ID : undefined;
if (RAW_GA_ID && !GA_ID) {
  console.warn(
    `[layout] NEXT_PUBLIC_GA_ID 형식 불일치로 GA 비활성화: length=${RAW_GA_ID.length}, value=${RAW_GA_ID} (expected /^G-[A-Z0-9]{8,20}$/)`,
  );
}

/**
 * 모든 페이지를 dynamic SSR 로 강제 — SSG 빌드 타임 캐싱 회피.
 *
 * Why:
 *   `NEXT_PUBLIC_GA_ID` 는 빌드 타임 인라인 변수인데, dev/운영 이미지 빌드 시
 *   `.dockerignore` 의 `.env*` 패턴으로 `.env.production` 이 빌드 컨테이너에서
 *   제외되어 빌드 타임에 `process.env.NEXT_PUBLIC_GA_ID` 가 `undefined` 가 된다.
 *   결과적으로 SSG 페이지(예: `/`, `/signup`)는 GA `<Script>` 가 없는 HTML 로
 *   영구 캐시되어 GA SDK 가 절대 로드되지 않고, 홈 진입 사용자의 SPA 이동
 *   전체에서 `/collect` 발송이 0 건이 된다.
 *
 *   런타임 ENV 는 docker-compose / 운영 환경설정에서 정상 주입되므로
 *   force-dynamic 으로 매 요청 SSR 렌더링 시 layout 이 런타임 `process.env`
 *   를 읽어 GA `<Script>` 가 모든 페이지 HTML 에 포함된다.
 *
 *   진짜 근본 해결은 인프라 단계의 `.dockerignore` / Dockerfile build-arg
 *   조정이지만, 그 전까지 본 directive 가 회피층 역할을 한다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Q.PARTNERS",
  description: "Q.PARTNERS",
  /**
   * Referrer-Policy 명시 — 자동로그인 외부 3사(HANASYS/Q.Order/Q.Musubi) 가
   * `request.getHeader("REFERER")` 로 호출 도메인 화이트리스트 검사를 수행하는데,
   * 브라우저 기본 정책(strict-origin-when-cross-origin) 은 cross-origin 시 origin 만
   * 전송하여 일부 환경에서 검사 단계에서 차단될 수 있다.
   *
   * `no-referrer-when-downgrade` 로 HTTPS → HTTPS 이동 시 full URL(path/query 포함) 이
   * Referer 헤더로 전송되도록 설정. HTTPS → HTTP 다운그레이드는 여전히 차단되어
   * downgrade 누설은 방어된다.
   */
  referrer: "no-referrer-when-downgrade",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <AdminTransitionRefresh />
          <div className="wrap">
            <Gnb />
            <Location />
            <div className="content">
              <ViewTransition>{children}</ViewTransition>
            </div>
            <Footer />
          </div>
          <PopupController />
          <AlertDialog />
        </QueryProvider>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            {/**
             * Why dangerouslySetInnerHTML 단일 문자열:
             *   JSX children 으로 주입한 템플릿 리터럴은 들여쓰기/개행이 그대로
             *   직렬화되어 향후 CSP `script-src 'strict-dynamic'` + hash 도입 시
             *   hash 가 들여쓰기에 민감해 정책이 깨질 수 있다. 단일 라인 문자열로
             *   안정적 hash 가능 형태 유지.
             *
             * Why id={`ga-init-${GA_ID}`}:
             *   `next/script` 의 id 는 dedup key. 환경별 빌드마다 GA_ID 가 다른데
             *   id 가 고정이면 동일 페이지에 다른 ID 가 공존하는 dev 시나리오에서
             *   재실행 누락 위험이 있다. 또한 ID 가 포함되어 디버깅 가독성도 향상.
             *
             * Why send_page_view 기본값 (생략 = true) — Redmine #2216 후속 (중복 카운트 해결):
             *   `gtag('config')` 의 첫 page_view 자동 발송 + GA4 Enhanced Measurement 의
             *   SPA navigation 자동 page_view 만으로 모든 화면이 1회 카운트된다.
             *   기존 manual 트래커(GaPageTracker) 가 자동 발송과 중복되어 모든 SPA navigation
             *   화면이 2회 카운트되던 결함의 원인이라 제거됨. redirect 케이스 (예: /password-reset
             *   → /login server-side redirect 후 popup 표시) 처럼 URL 변경이 일어나지 않아
             *   자동 발송이 누락되는 가상 경로만 코드에서 별도 발송한다
             *   (`password-reset-popup.tsx` 의 `/login/password-reset` 가상 page_view).
             *
             *   보안 트레이드오프: 자동 발송은 `window.location.href` 원본을 그대로 GA 로
             *   전송하므로 query string 의 민감값(자동로그인 페이로드·재설정 토큰 등)이 GA 로
             *   누설될 수 있다. 토큰을 query 로 노출하는 새 라우트를 추가할 때는 server-side
             *   redirect 후 가상 page_view 패턴을 따를 것.
             *
             * Why gtag('consent','default',...):
             *   ad_storage 거부 / analytics_storage 허용 으로 광고 식별자 차단
             *   (EU 권역 GDPR / 일본 個人情報保護法 보수 운영) + 분석 데이터는 수집되도록 명시.
             */}
            <Script
              id={`ga-init-${GA_ID}`}
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html:
                  `window.dataLayer=window.dataLayer||[];` +
                  `function gtag(){dataLayer.push(arguments);}` +
                  `gtag('consent','default',{ad_storage:'denied',analytics_storage:'granted'});` +
                  `gtag('js',new Date());` +
                  // send_page_view:false → 첫 페이지 로드의 자동 page_view 차단.
                  // GA4 Property dashboard 의 Enhanced Measurement "Page changes based on
                  // browser history events" 토글도 OFF 와 함께 적용해야 자동 발송이 완전 차단된다.
                  // 두 군데 모두 OFF + GaPageTracker 의 manual 발송 1회로 단일화 → Redmine #2216
                  // 중복 카운트 사고 회피. 한쪽만 OFF 면 0배 또는 2배 카운트가 발생하므로
                  // 코드 PR 머지와 dashboard 설정 변경은 반드시 동시 적용해야 한다.
                  `gtag('config','${GA_ID}',{anonymize_ip:true,send_page_view:false});`,
              }}
            />
            <GaPageTracker />
          </>
        )}
      </body>
    </html>
  );
}
