import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { LoginLoader } from "@/components/login/login-loader";

export const metadata: Metadata = {
  title: "ログイン | Q.PARTNERS",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const user = await verifyToken(token);
    if (user?.twoFactorVerified) {
      redirect("/");
    }
  }

  return <LoginLoader />;
}
