import { redirect } from "next/navigation";

interface PasswordResetPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * 구 비밀번호 초기화 페이지 — /login?reset-token=… popup 흐름으로 통합되어 deprecated.
 * 메일 발송 후 1시간 TTL 내에 사용자가 옛 메일의 `/password-reset?token=…` 링크를 클릭할 수 있어
 * 호환성을 위해 server-side redirect 로 신규 경로(/login?reset-token=…) 로 이관한다.
 */
export default async function PasswordResetPage({ searchParams }: PasswordResetPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  if (token) {
    redirect(`/login?reset-token=${encodeURIComponent(token)}`);
  }
  redirect("/login");
}
