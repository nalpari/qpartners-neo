import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import { Gnb } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Location } from "@/components/layout/location";
import { PopupController } from "@/components/common/popup-controller";
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
          <div className="wrap">
            <Gnb />
            <Location />
            <div className="content">
              {children}
            </div>
            <Footer />
          </div>
          <PopupController />
        </QueryProvider>
      </body>
    </html>
  );
}
