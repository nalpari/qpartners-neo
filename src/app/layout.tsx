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
import { GaPageTracker } from "@/components/common/ga-page-tracker";
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
  // GA 4 측정 ID — `@next/third-parties` 가 Turbopack 워커 충돌 유발하여
  // `next/script` 로 직접 삽입한다. ID 는 `G-` + 대문자/숫자 8~20 자만 허용해
  // 인라인 스크립트 주입 위험과 비정상 길이 입력을 차단한다.
  // 형식 불일치 시 무음 비활성화 대신 console.warn 으로 운영자가 인지 가능하게 한다.
  const rawGaId = process.env.NEXT_PUBLIC_GA_ID;
  const gaId =
    rawGaId && /^G-[A-Z0-9]{8,20}$/.test(rawGaId) ? rawGaId : undefined;
  if (rawGaId && !gaId) {
    console.warn(
      "[layout] NEXT_PUBLIC_GA_ID 형식 불일치로 GA 비활성화:",
      `${rawGaId.slice(0, 4)}***`,
    );
  }

  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <AdminTransitionRefresh />
          {gaId && <GaPageTracker />}
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
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            {/**
             * Why dangerouslySetInnerHTML 단일 문자열:
             *   JSX children 으로 주입한 템플릿 리터럴은 들여쓰기/개행이 그대로
             *   직렬화되어 향후 CSP `script-src 'strict-dynamic'` + hash 도입 시
             *   hash 가 들여쓰기에 민감해 정책이 깨질 수 있다. 단일 라인 문자열로
             *   안정적 hash 가능 형태 유지.
             *
             * Why id={`ga-init-${gaId}`}:
             *   `next/script` 의 id 는 dedup key. 환경별로 gaId 가 다른데 id 가
             *   고정이면 라우트 전환 등으로 gaId 변경 시 재실행되지 않을 위험.
             */}
            <Script
              id={`ga-init-${gaId}`}
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html:
                  `window.dataLayer=window.dataLayer||[];` +
                  `function gtag(){dataLayer.push(arguments);}` +
                  `gtag('js',new Date());` +
                  `gtag('config','${gaId}',{anonymize_ip:true});`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
