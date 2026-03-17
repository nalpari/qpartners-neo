"use client";

import { usePopupStore } from "@/lib/store";
import { IdInquiryPopup } from "@/components/login/id-inquiry-popup";
import { PasswordResetPopup } from "@/components/login/password-reset-popup";
import { PersonalInfoPopup } from "@/components/mypage/personal-info-popup";

export function PopupController() {
  const activePopup = usePopupStore((s) => s.activePopup);

  switch (activePopup) {
    case "id-inquiry":
      return <IdInquiryPopup />;
    case "password-reset":
      return <PasswordResetPopup />;
    case "personal-info":
      return <PersonalInfoPopup />;
    default:
      return null;
  }
}
