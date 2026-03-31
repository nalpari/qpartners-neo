import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/jwt";
import { LoginLoader } from "@/components/login/login-loader";

export const metadata: Metadata = {
  title: "ログイン | Q.PARTNERS",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)) {
    redirect("/");
  }

  return <LoginLoader />;
}
