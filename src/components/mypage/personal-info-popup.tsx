"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePopupStore } from "@/lib/store";
import { Button, InputBox } from "@/components/common";

type EmailCheckResult = "ok" | "fail" | null;

const CLOSE_ANIMATION_MS = 200;

export function PersonalInfoPopup() {
  const router = useRouter();
  const { popupData, closePopup } = usePopupStore();
  const currentEmail = popupData.currentEmail as string | undefined;
  const hasExistingEmail = !!currentEmail;

  const [isClosing, setIsClosing] = useState(false);
  const [email, setEmail] = useState("");
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailCheckResult, setEmailCheckResult] =
    useState<EmailCheckResult>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isFormValid =
    (hasExistingEmail ||
      (email.trim() !== "" && emailChecked && emailCheckResult === "ok")) &&
    newPassword.length >= 6 &&
    confirmPassword.length > 0 &&
    confirmPassword === newPassword;

  const resetForm = () => {
    setEmail("");
    setEmailChecked(false);
    setEmailCheckResult(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      resetForm();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleCancel = () => {
    handleClose();
    router.push("/login");
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailChecked(false);
    setEmailCheckResult(null);
  };

  const handleEmailCheck = () => {
    if (email.trim() === "") return;

    // TODO: API 호출 (POST /api/members/check-email)
    setEmailChecked(true);
    setEmailCheckResult("ok");
  };

  const handleSave = () => {
    if (!isFormValid) return;

    // TODO: API 호출 (PUT /api/members/personal-info)
    handleClose();
    window.alert("저장되었습니다.");
  };

  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
    >
      <div
        className="popup-container"
        role="dialog"
        aria-modal="true"
        aria-label="会員情報の設定"
      >
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            <span className="hidden lg:inline">会員情報の設定</span>
            <span className="lg:hidden">個人情報設定</span>
          </h2>
          <button
            type="button"
            onClick={handleCancel}
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
        <div className="flex flex-col gap-[24px] w-full">
          <div className="flex flex-col gap-[16px] w-full">
            {/* Eメール 필드 */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                Eメール
                <span className="text-[#FF1A1A]">*</span>
              </label>
              {hasExistingEmail ? (
                /* 이메일 있는 경우: read-only 표시, 중복체크 버튼 숨김 */
                <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                  <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                    {currentEmail}
                  </span>
                </div>
              ) : (
                /* 이메일 없는 경우: 입력 + 중복체크 */
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex flex-col lg:flex-row gap-2 items-start w-full">
                    <InputBox
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      className="lg:flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleEmailCheck}
                      className="w-full lg:w-[110px] shrink-0"
                    >
                      冗長チェック
                    </Button>
                  </div>
                  {emailCheckResult === "ok" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#22C55E]">
                      使用可能なメールアドレスです。
                    </p>
                  )}
                  {emailCheckResult === "fail" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a]">
                      既に使用中のメールです.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 新規パスワード */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                新規パスワード
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="relative w-full">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6桁以上入力してください"
                  className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[6px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#999]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label={
                    showNewPassword
                      ? "パスワードを非表示"
                      : "パスワードを表示"
                  }
                >
                  <Image
                    src={showNewPassword ? "/asset/images/contents/default_eye_show.svg" : "/asset/images/contents/default_eye_hide.svg"}
                    alt=""
                    width={20}
                    height={14}
                  />
                </button>
              </div>
              <p className="font-['Noto_Sans_JP'] font-normal text-[13px] lg:text-[14px] leading-[1.5] text-[#1060b4]">
                ※英語/数字/記号のうち2つ以上を組み合わせて8文字以上に設定
              </p>
            </div>

            {/* 新規パスワード再入力 */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                新規パスワード再入力
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="relative w-full">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[6px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label={
                    showConfirmPassword
                      ? "パスワードを非表示"
                      : "パスワードを表示"
                  }
                >
                  <Image
                    src={showConfirmPassword ? "/asset/images/contents/default_eye_show.svg" : "/asset/images/contents/default_eye_hide.svg"}
                    alt=""
                    width={20}
                    height={14}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="popup-buttons--inline">
            <Button variant="secondary" onClick={handleCancel}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!isFormValid}
            >
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
