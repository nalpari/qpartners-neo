"use client";

import { usePopupStore } from "@/lib/store";
import { IdInquiryPopup } from "@/components/popup/id-inquiry-popup";
import { PasswordResetPopup } from "@/components/popup/password-reset-popup";
import { PersonalInfoPopup } from "@/components/popup/personal-info-popup";
import { TwoFactorAuthPopup } from "@/components/popup/two-factor-auth-popup";
import { ZipcodeSearchPopup } from "@/components/popup/zipcode-search-popup";
import { SignupCompletePopup } from "@/components/popup/signup-complete-popup";
import { PasswordChangePopup } from "@/components/popup/password-change-popup";
import { WithdrawPopup } from "@/components/popup/withdraw-popup";

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
    case "password-change":
      return <PasswordChangePopup />;
    case "withdraw":
      return <WithdrawPopup />;
    default:
      return null;
  }
}
