"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePopupStore } from "@/lib/store";
import { Button, InputBox } from "@/components/common";

type EmailCheckResult = "ok" | "fail" | null;

const CLOSE_ANIMATION_MS = 200;

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 5C7.45 5 3.57 7.95 2 12c1.57 4.05 5.45 7 10 7s8.43-2.95 10-7c-1.57-4.05-5.45-7-10-7z"
          stroke="#999"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="12" cy="12" r="3" stroke="#999" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5C7.45 5 3.57 7.95 2 12c1.57 4.05 5.45 7 10 7s8.43-2.95 10-7c-1.57-4.05-5.45-7-10-7z"
        stroke="#999"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="#999" strokeWidth="1.5" fill="none" />
      <path d="M4 20L20 4" stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
    // 현재(API 미연동): 무조건 OK 결과로 처리
    setEmailChecked(true);
    setEmailCheckResult("ok");
  };

  const handleSave = () => {
    if (!isFormValid) return;

    // TODO: API 호출 (PUT /api/members/personal-info)
    handleClose();
    window.alert("저장되었습니다.");
  };

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onClick={handleCancel}
    >
      <div
        className="popup-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="個人情報設定"
      >
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            個人情報設定
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
        <div className="flex flex-col gap-4 w-full">
          {/* 이메일 필드 */}
          <div className="flex flex-col gap-2 w-full">
            <label className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#767676]">
              メールアドレス
              <span className="text-[#FF1A1A]">*</span>
            </label>
            {hasExistingEmail ? (
              <div className="flex flex-col lg:flex-row gap-2 items-start w-full">
                <InputBox
                  type="email"
                  value={currentEmail}
                  readOnly
                  className="lg:flex-1"
                />
                <Button
                  variant="outline"
                  disabled
                  className="w-full lg:w-[110px] shrink-0"
                >
                  冗長チェック
                </Button>
              </div>
            ) : (
              <>
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
                  <p className="text-[12px] text-[#22C55E] mt-1">
                    使用可能なメールアドレスです。
                  </p>
                )}
                {emailCheckResult === "fail" && (
                  <p className="text-[12px] text-[#FF1A1A] mt-1">
                    既に使用中のメールアドレスです。
                  </p>
                )}
              </>
            )}
          </div>

          {/* 신규 비밀번호 */}
          <div className="flex flex-col gap-2 w-full">
            <label className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#767676]">
              新規パスワード
              <span className="text-[#FF1A1A]">*</span>
            </label>
            <div className="relative w-full">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6자리 이상 입력해 주세요"
                className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                aria-label={
                  showNewPassword
                    ? "パスワードを非表示"
                    : "パスワードを表示"
                }
              >
                <EyeIcon visible={showNewPassword} />
              </button>
            </div>
          </div>

          {/* 신규 비밀번호 재입력 */}
          <div className="flex flex-col gap-2 w-full">
            <label className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#767676]">
              新規パスワード再入力
              <span className="text-[#FF1A1A]">*</span>
            </label>
            <div className="relative w-full">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                aria-label={
                  showConfirmPassword
                    ? "パスワードを非表示"
                    : "パスワードを表示"
                }
              >
                <EyeIcon visible={showConfirmPassword} />
              </button>
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
