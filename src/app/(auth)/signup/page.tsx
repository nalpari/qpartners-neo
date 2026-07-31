import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupContents } from "@/components/signup/signup-contents";
import { getFallbackRole, isInternalUser } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "会員登録 | Q.PARTNERS",
};

// 일반회원 등록은 관리자 대리등록으로 전환 — 슈퍼관리자/관리자(SUPER_ADMIN·ADMIN) 역할만 접근 가능.
// 매트릭스(ADM_MEMBER create) 가 아닌 역할 기준 고정 — 다른 역할에 create 권한이 부여돼도 차단.
export default async function SignupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // 2FA 미완료 — middleware / 관리자 레이아웃과 동일 fail-closed
  if (user.twoFactorVerified === false) redirect("/login");

  const role = user.authRole ?? getFallbackRole(user.userTp);
  if (!role || !isInternalUser(role)) redirect("/");

  return <SignupContents />;
}
