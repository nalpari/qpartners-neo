import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "@/lib/jwt";
import { LoginLoader } from "@/components/login/login-loader";
import { LOGIN_QUERY_ERROR_MESSAGES } from "@/components/login/types";

export const metadata: Metadata = {
  title: "ログイン | Q.PARTNERS",
  /**
   * /login 한정 referrer 정책 — root layout 의 `no-referrer-when-downgrade` 를 override.
   *
   * 비밀번호 재설정 메일 링크(`/login?reset-token=…`) 진입 시 client useEffect 의
   * `history.replaceState` 가 토큰을 즉시 제거하지만, GA4 Enhanced Measurement 의
   * gtag.js 가 브라우저 캐시에서 즉시 로드되는 극단적 edge case 에서 token 정리 이전에
   * 자동 page_view 발송이 일어나 Referer 헤더로 토큰이 GA 로 누설될 가능성이 이론적으로 존재.
   *
   * `/login` 페이지에서는 자동로그인 외부 3사(HANASYS/Q.Order/Q.Musubi) 직접 호출이 없고,
   * 회원가입 외부 링크는 `rel="noopener noreferrer"` 로 처리되어 있어 `no-referrer` 적용 시
   * 외부 호출 호환성 영향 없음.
   */
  referrer: "no-referrer",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; "reset-token"?: string }>;
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

  // 비밀번호 초기화 메일에서 진입 시 reset-token 쿼리 감지 → 클라이언트에서 verify 후 PersonalInfoPopup 오픈.
  // 포맷 검증 — generateRawResetToken 이 crypto.randomUUID 를 사용하므로 RFC 4122 v4 엄격 패턴만 허용.
  // 3번째 그룹 `4xxx` (version 4 nibble), 4번째 그룹 `[89ab]xxx` (variant bits) 강제로 임의 16진수
  // 토큰 변조 차단. RSC hydration payload 변조 방어 (XSS / 토큰 탈취 추적 회피).
  const RESET_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const rawResetToken = typeof params["reset-token"] === "string" ? params["reset-token"] : null;
  const initialResetToken = rawResetToken && RESET_TOKEN_PATTERN.test(rawResetToken) ? rawResetToken : null;

  return <LoginLoader initialError={initialError} initialResetToken={initialResetToken} />;
}
