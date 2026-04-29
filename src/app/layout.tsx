import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import { Gnb } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Location } from "@/components/layout/location";
import { PopupController } from "@/components/common/popup-controller";
import { AlertDialog } from "@/components/common/alert-dialog";
import { AdminTransitionRefresh } from "@/components/common/admin-transition-refresh";
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
      </body>
    </html>
  );
}
