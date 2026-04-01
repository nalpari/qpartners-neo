"use client";

import { usePopupStore } from "@/lib/store";

export function TermsButton() {
  const openPopup = usePopupStore((s) => s.openPopup);

  return (
    <button
      type="button"
      onClick={() => openPopup("terms")}
      className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#e97923] underline whitespace-nowrap cursor-pointer"
    >
      利用規約
    </button>
  );
}
