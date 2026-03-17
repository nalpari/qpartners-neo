"use client";

import { usePopupStore } from "@/lib/store";
import { IdInquiryPopup } from "@/components/login/id-inquiry-popup";

export function PopupController() {
  const activePopup = usePopupStore((s) => s.activePopup);

  switch (activePopup) {
    case "id-inquiry":
      return <IdInquiryPopup />;
    default:
      return null;
  }
}
