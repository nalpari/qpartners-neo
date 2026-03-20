"use client";

import { usePopupStore } from "@/lib/store";
import { IdInquiryPopup } from "@/components/login/id-inquiry-popup";
import { PasswordResetPopup } from "@/components/login/password-reset-popup";
import { PersonalInfoPopup } from "@/components/mypage/personal-info-popup";
import { TwoFactorAuthPopup } from "@/components/login/two-factor-auth-popup";
import { ZipcodeSearchPopup } from "@/components/signup/zipcode-search-popup";
import { SignupCompletePopup } from "@/components/signup/signup-complete-popup";

export function PopupController() {
  const activePopup = usePopupStore((s) => s.activePopup);

  switch (activePopup) {
    case "id-inquiry":
      return <IdInquiryPopup />;
    case "password-reset":
      return <PasswordResetPopup />;
    case "personal-info":
      return <PersonalInfoPopup />;
    case "two-factor-auth":
      return <TwoFactorAuthPopup />;
    case "zipcode-search":
      return <ZipcodeSearchPopup />;
    case "signup-complete":
      return <SignupCompletePopup />;
    default:
      return null;
  }
}
