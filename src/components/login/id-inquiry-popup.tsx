"use client";

import { useState } from "react";
import { usePopupStore } from "@/lib/store";
import { Button } from "@/components/common";

type TabType = "dealer" | "installer" | "general";

const MEMBER_TYPES: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "一般会員" },
];

const FORM_FIELDS = [
  { key: "companyName", label: "会社名" },
  { key: "memberName", label: "会員名" },
  { key: "email", label: "会員メール" },
  { key: "phone", label: "会員連絡先" },
] as const;

type FormKey = (typeof FORM_FIELDS)[number]["key"];

const CLOSE_ANIMATION_MS = 200;

export function IdInquiryPopup() {
  const { popupData, closePopup } = usePopupStore();
  const activeTab = (popupData.activeTab as TabType) ?? "dealer";
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState<Record<FormKey, string>>({
    companyName: "",
    memberName: "",
    email: "",
    phone: "",
  });

  const handleFieldChange = (key: FormKey, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setFormData({ companyName: "", memberName: "", email: "", phone: "" });
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      resetForm();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSubmit = () => {
    const hasEmpty = FORM_FIELDS.some(
      (field) => formData[field.key].trim() === ""
    );
    if (hasEmpty) return;

    // TODO: API 호출 (관리자 이메일 발송)
    handleClose();
    window.alert(
      "문의 내용이 관리자에게 전달되었습니다. 확인 후 입력하신 연락처로 연락드리겠습니다.(처리에는 1~2 영업일이 소요될 수 있습니다.)"
    );
  };

  return (
    <div className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`} onClick={handleClose}>
      <div
        className="popup-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="ID紛失お問い合わせ"
      >
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            ID紛失お問い合わせ
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#E97923] cursor-pointer"
            aria-label="閉じる"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M1 1L9 9M9 1L1 9"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-6 lg:gap-[30px] w-full">
          {/* 안내 문구 */}
          <div className="w-full">
            <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-medium leading-[1.5] text-[#101010]">
              ID確認のために会員情報を入力してください.
            </p>
            <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-normal leading-[1.5] text-[#767676]">
              本人確認後IDをご案内いたします.
            </p>
          </div>

          {/* 회원타입 (Read Only — 텍스트 표시) */}
          <div className="flex flex-col gap-2 w-full">
            <p className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#767676]">
              会員タイプ
            </p>
            <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-medium leading-[1.5] text-[#101010]">
              {MEMBER_TYPES.find((t) => t.key === activeTab)?.label}
            </p>
          </div>

          {/* 폼 필드 */}
          <div className="flex flex-col gap-4 w-full">
            {FORM_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-2 w-full">
                <label className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#767676]">
                  {field.label}
                  <span className="text-[#FF1A1A]">*</span>
                </label>
                <input
                  type="text"
                  value={formData[field.key]}
                  onChange={(e) =>
                    handleFieldChange(field.key, e.target.value)
                  }
                  className="w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]"
                />
              </div>
            ))}
          </div>

          {/* 버튼 */}
          <div className="popup-buttons">
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              ID紛失お問い合わせ
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
