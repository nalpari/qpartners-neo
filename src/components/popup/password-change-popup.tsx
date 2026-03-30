"use client";

import { useState } from "react";
import Image from "next/image";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function PasswordChangePopup() {
  const { closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!currentPassword) {
      newErrors.current = "現在のパスワードを入力してください";
    }
    if (!newPassword) {
      newErrors.new = "新規パスワードを入力してください";
    } else {
      let types = 0;
      if (/[a-zA-Z]/.test(newPassword)) types++;
      if (/[0-9]/.test(newPassword)) types++;
      if (/[^a-zA-Z0-9]/.test(newPassword)) types++;
      if (newPassword.length < 8 || types < 2) {
        newErrors.new = "英語/数字/記号のうち2つ以上を組み合わせて8文字以上で入力してください";
      }
    }
    if (!confirmPassword) {
      newErrors.confirm = "新規パスワードを再入力してください";
    } else if (newPassword && confirmPassword !== newPassword) {
      newErrors.confirm = "新規パスワードが一致しません";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSubmit = () => {
    if (!validate()) return;
    openAlert({ type: "alert", message: "パスワード変更機能は準備中です" });
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleClose();
  };

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="popup-container w-[339px] lg:w-[620px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="パスワード変更"
      >
        <div className="popup-container__inner">
        {/* タイトル */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            パスワード変更
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

        {/* 本文 */}
        <div className="flex flex-col w-full">
          <div className="flex flex-col gap-[24px] lg:gap-[30px] w-full">
            {/* 説明 */}
            <p className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-[1.5] text-[#101010]">
              現在のパスワードと新しいパスワードを入力してください
            </p>

            {/* フォーム */}
            <div className="flex flex-col gap-[24px] w-full">
              {/* 現在のパスワード */}
              <div className="flex flex-col gap-[8px] w-full">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#101010]">
                  現在のパスワード入力
                  <span className="text-[#ff1a1a]">*</span>
                </p>
                <PasswordInput
                  value={currentPassword}
                  onChange={(v) => { setCurrentPassword(v); setErrors((e) => ({ ...e, current: "" })); }}
                  show={showCurrent}
                  onToggle={() => setShowCurrent((v) => !v)}
                  hasError={!!errors.current}
                />
                {errors.current && (
                  <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">{errors.current}</p>
                )}
              </div>

              {/* 新規パスワード */}
              <div className="flex flex-col gap-[8px] w-full">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#101010]">
                  新規パスワード入力
                  <span className="text-[#ff1a1a]">*</span>
                </p>
                <PasswordInput
                  value={newPassword}
                  onChange={(v) => { setNewPassword(v); setErrors((e) => ({ ...e, new: "" })); }}
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  hasError={!!errors.new}
                />
                {errors.new ? (
                  <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">{errors.new}</p>
                ) : (
                  <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060b4]">
                    ※英語/数字/記号のうち2つ以上を組み合わせて8文字以上に設定
                  </p>
                )}
              </div>

              {/* 新規パスワード再入力 */}
              <div className="flex flex-col gap-[8px] w-full">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#101010]">
                  新規パスワード再入力
                  <span className="text-[#ff1a1a]">*</span>
                </p>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirm: "" })); }}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  hasError={!!errors.confirm}
                />
                {errors.confirm && (
                  <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">{errors.confirm}</p>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-[8px] items-center justify-center w-full">
                <Button
                  variant="secondary"
                  onClick={handleClose}
                  className="flex-1 lg:flex-none lg:w-[97px]"
                >
                  キャンセル
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  className="w-[128px] lg:w-[68px]"
                >
                  変更
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  hasError?: boolean;
}) {
  return (
    <div className={`flex items-center gap-[8px] w-full h-[42px] px-[16px] bg-white border rounded-[4px] overflow-hidden transition-colors duration-150 ${
      hasError ? "border-[#ff1a1a]" : "border-[#ebebeb] focus-within:border-[#101010]"
    }`}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none text-[#101010]"
      />
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 cursor-pointer"
        aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
      >
        <Image
          src={
            show
              ? "/asset/images/contents/default_eye_show.svg"
              : "/asset/images/contents/default_eye_hide.svg"
          }
          alt=""
          width={20}
          height={14}
        />
      </button>
    </div>
  );
}
