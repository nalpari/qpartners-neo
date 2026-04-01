import type { Metadata } from "next";
import { SignupContents } from "@/components/signup/signup-contents";

export const metadata: Metadata = {
  title: "会員登録 | Q.PARTNERS",
};

export default function SignupPage() {
  return <SignupContents />;
}
