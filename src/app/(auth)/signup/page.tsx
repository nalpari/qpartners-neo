import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupContents } from "@/components/signup/signup-contents";
import { getFallbackRole, isInternalUser } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "会員登録 | Q.PARTNERS",
};

/**
 * 일반회원 등록 페이지 — SUPER_ADMIN·ADMIN 전용 (셀프 회원가입 폐지).
 *
 * 관리자 회원관리 목록의 [既存Q.PARTNERS会員 新規登録] 버튼에서 새 탭으로 진입한다.
 * 가드 규칙은 `requirePageMenuPermission` 과 동일 정책을 따르되, 판정 기준은
 * 메뉴 매트릭스가 아니라 사내 사용자 여부(`isInternalUser`) 다 —
 * 회원등록은 운영자가 토글하는 메뉴 역량이 아니라 사용자 유형에 종속되는 관문이므로
 * `ADM_MEMBER.canCreate` 로 치환하면 의도와 어긋난다 (`auth.ts#isInternalUser` 예외 조항 참조).
 * 서버 최종 방어선은 `/api/auth/signup` 의 동일 가드.
 *
 * ※ `/api/auth/email/check` 는 会員情報の設定(최초 로그인) 경로와 공용이라 PUBLIC 유지 —
 *   실제 회원 생성은 `/api/auth/signup` 에서만 일어나므로 가드는 그쪽에 건다.
 */
export default async function SignupPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }
  // 2FA 필요하나 미완료 — middleware / rbac-guard 와 동일 fail-closed
  if (user.twoFactorVerified === false) {
    redirect("/login");
  }

  const roleCode = user.authRole ?? getFallbackRole(user.userTp);
  if (!roleCode || !isInternalUser(roleCode)) {
    console.warn(
      `[SignupPage] 사내 사용자 아님 — / redirect (userTp=${user.userTp})`,
    );
    redirect("/");
  }

  return <SignupContents />;
}
