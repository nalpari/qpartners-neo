import type { Metadata } from "next";
import { PasswordResetClient } from "@/components/password-reset/password-reset-client";

export const metadata: Metadata = {
  title: "パスワード再設定 | Q.PARTNERS",
};

export default function PasswordResetPage() {
  return <PasswordResetClient />;
}
