"use client";

import { useState, useCallback } from "react";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";

type TabType = "dealer" | "installer" | "general";

const TAB_TO_USER_TP: Record<TabType, string> = {
  dealer: "DEALER",
  installer: "SEKO",
  general: "GENERAL",
};

const MEMBER_TYPES: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "一般会員" },
];

interface FormData {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  idEmail: string;
  fullName: string;
}

const INITIAL_FORM: FormData = {
  id: "",
  email: "",
  lastName: "",
  firstName: "",
  idEmail: "",
  fullName: "",
};

const CLOSE_ANIMATION_MS = 200;

function isFormValid(tab: TabType, data: FormData): boolean {
  switch (tab) {
    case "dealer":
      return data.id.trim() !== "" && data.email.trim() !== "";
    case "installer":
      return data.email.trim() !== "";
    case "general":
      return data.idEmail.trim() !== "";
  }
}

export function PasswordResetPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const activeTab = (popupData.activeTab as TabType) ?? "dealer";
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState<FormData>({ ...INITIAL_FORM });

  const handleChange = (key: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setFormData({ ...INITIAL_FORM });
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  }, [closePopup]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!isFormValid(activeTab, formData) || isSubmitting) return;

    const userTp = TAB_TO_USER_TP[activeTab];
    const payload: Record<string, string> = { userTp, email: "" };

    switch (activeTab) {
      case "dealer":
        payload.loginId = formData.id;
        payload.email = formData.email;
        break;
      case "installer":
        payload.email = formData.email;
        break;
      case "general":
        payload.email = formData.idEmail;
        break;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        openAlert({
          type: "alert",
          message: json.error ?? "サーバーエラーが発生しました。",
        });
        return;
      }

      handleClose();
      openAlert({
        type: "alert",
        message: "パスワード変更リンクがメールで送信されました。",
      });
    } catch {
      openAlert({
        type: "alert",
        message: "サーバーに接続できません。しばらくしてからもう一度お試しください。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [activeTab, formData, isSubmitting, handleClose, openAlert]);

  const inputClass =
    "w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]";
  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onClick={handleClose}
    >
      <div
        className="popup-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="パスワードの初期化"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            パスワードの初期化
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
          <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-medium leading-[1.5] text-[#101010] w-full">
            パスワードを初期化するIDとEメールアドレスを入力してください
          </p>

          {/* 폼 필드 */}
          <div className="flex flex-col gap-4 w-full">
            {/* 회원타입 (Read Only) */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                会員タイプ
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                  {MEMBER_TYPES.find((t) => t.key === activeTab)?.label}
                </span>
              </div>
            </div>
            {activeTab === "dealer" && (
              <>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    ID<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => handleChange("id", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    E-Mail<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {activeTab === "installer" && (
              <div className="flex flex-col gap-2 w-full">
                <label className={labelClass}>
                  E-Mail<span className="text-[#FF1A1A]">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            {activeTab === "general" && (
              <div className="flex flex-col gap-2 w-full">
                <label className={labelClass}>
                  ID(E-Mail)<span className="text-[#FF1A1A]">*</span>
                </label>
                <input
                  type="email"
                  value={formData.idEmail}
                  onChange={(e) => handleChange("idEmail", e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* 버튼 */}
          <div className="popup-buttons">
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
              パスワードの初期化
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
