import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { LoginLoader } from "@/components/login/login-loader";
import { LOGIN_QUERY_ERROR_MESSAGES } from "@/components/login/types";

export const metadata: Metadata = {
  title: "ログイン | Q.PARTNERS",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const user = await verifyToken(token);
    if (user?.twoFactorVerified) {
      redirect("/");
    }
  }

  // 자동로그인(inbound) 등 외부에서 전달된 error 코드 → 안내 메시지 주입.
  // 허용 리스트 매핑이므로 임의 문자열 주입 대응 불필요 (XSS 방어는 React escape 에 추가로 allowlist 로 이중화).
  // Next.js searchParams 는 동일 키 반복(`?error=a&error=b`) 시 string[] 로 유입 가능 — typeof 가드로 string 만 수용.
  const params = await searchParams;
  const rawError = typeof params.error === "string" ? params.error : null;
  const initialError = rawError ? LOGIN_QUERY_ERROR_MESSAGES[rawError] ?? null : null;

  return <LoginLoader initialError={initialError} />;
}
