"use client";

import { useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";

type TabType = "dealer" | "installer" | "general";

const TAB_TO_USERTP: Record<TabType, string> = {
  dealer: "DEALER",
  installer: "SEKO",
  general: "GENERAL",
};

const MEMBER_TYPES: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "一般会員" },
];

interface PasswordResetFormData {
  id: string;
  email: string;
  idEmail: string;
}

const INITIAL_FORM: PasswordResetFormData = {
  id: "",
  email: "",
  idEmail: "",
};

const CLOSE_ANIMATION_MS = 200;

function isFormValid(tab: TabType, data: PasswordResetFormData): boolean {
  switch (tab) {
    case "dealer":
      return data.id.trim() !== "" && data.email.trim() !== "";
    case "installer":
      return data.email.trim() !== "";
    case "general":
      return data.idEmail.trim() !== "";
  }
}

function buildRequestBody(tab: TabType, data: PasswordResetFormData) {
  const base = { userTp: TAB_TO_USERTP[tab] };
  switch (tab) {
    case "dealer":
      return { ...base, loginId: data.id, email: data.email };
    case "installer":
      return { ...base, email: data.email };
    case "general":
      return { ...base, email: data.idEmail };
  }
}

export function PasswordResetPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const activeTab = (popupData.activeTab as TabType) ?? "dealer";
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState<PasswordResetFormData>({ ...INITIAL_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (key: keyof PasswordResetFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setFormData({ ...INITIAL_FORM });
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSubmit = async () => {
    if (!isFormValid(activeTab, formData)) return;

    setIsSubmitting(true);
    try {
      const body = buildRequestBody(activeTab, formData);
      await api.post("/auth/password-reset/request", body);

      handleClose();
      openAlert({
        type: "alert",
        message: "初期化パスワードがメールで送信されました。ログイン後、パスワードを変更してください。",
      });
    } catch (err) {
      console.error("[PasswordReset] 비밀번호 초기화 요청 실패:", err);
      if (err instanceof AxiosError && err.response?.status === 400) {
        const body: unknown = err.response.data;
        const hasError = typeof body === "object" && body !== null && "error" in body;
        if (hasError) {
          openAlert({
            type: "alert",
            message: "一致する会員情報がありません。入力した情報を再度ご確認ください。",
          });
        } else {
          openAlert({
            type: "alert",
            message: "入力内容を確認してください",
          });
        }
      } else {
        openAlert({
          type: "alert",
          message: "サーバーに接続できません。しばらくしてからお試しください",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
            <Button
              variant="primary"
              onClick={() => { void handleSubmit(); }}
              disabled={isSubmitting || !isFormValid(activeTab, formData)}
            >
              {isSubmitting ? "処理中..." : "パスワードの初期化"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
