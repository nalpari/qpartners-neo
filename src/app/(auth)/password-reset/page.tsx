import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordResetClient } from "@/components/password-reset/password-reset-client";

export const metadata: Metadata = {
  title: "パスワード再設定 | Q.PARTNERS",
};

export default function PasswordResetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <p className="font-['Noto_Sans_JP'] text-sm text-[#999]">読み込み中...</p>
        </div>
      }
    >
      <PasswordResetClient />
    </Suspense>
  );
}
