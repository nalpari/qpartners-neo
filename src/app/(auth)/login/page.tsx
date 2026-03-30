import type { Metadata } from "next";
import { LoginContents } from "@/components/login/login-contents";

export const metadata: Metadata = {
  title: "ログイン | Q.PARTNERS",
};

export default function LoginPage() {
  return <LoginContents />;
}
