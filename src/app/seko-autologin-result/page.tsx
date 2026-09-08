import { SekoAutoLoginResult } from "@/components/mypage/info/seko-autologin-result";
import { isSekoAutoLoginFailureReason } from "@/lib/seko-autologin-result";

interface SekoAutoLoginResultPageProps {
  searchParams: Promise<{ reason?: string }>;
}

/**
 * SEKO 자동로그인 실패 착지 화면 — `GET /api/auth/seko/autologin` 의 실패 리다이렉트 대상.
 *
 * `/mypage` 하위에 두지 않는다. 세션 만료로 온 경우 이미 인증 쿠키가 삭제된 상태라
 * 마이페이지 RBAC 가드에 걸려 사유를 전달하기도 전에 튕긴다.
 */
export default async function SekoAutoLoginResultPage({
  searchParams,
}: SekoAutoLoginResultPageProps) {
  const { reason } = await searchParams;
  // 쿼리는 사용자가 조작할 수 있다 — 화이트리스트 밖 값은 일반 실패로 접는다.
  const safeReason = isSekoAutoLoginFailureReason(reason) ? reason : "failed";
  return <SekoAutoLoginResult reason={safeReason} />;
}
