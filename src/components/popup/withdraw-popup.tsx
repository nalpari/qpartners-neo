"use client";

import { useState } from "react";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

const USER_INFO = [
  { label: "会社名", value: "INTERPLUG TEST" },
  { label: "氏名", value: "金志映" },
  { label: "メールアドレス (ID)", value: "kjy0501@interplug.co.kr" },
  { label: "電話番号", value: "03-5441-5943" },
];

export function WithdrawPopup() {
  const { closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();

  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError("退会理由を入力してください");
      return;
    }
    openAlert({ type: "alert", message: "会員退会が完了されました。ご利用ありがとうございます。" });
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
        className="popup-container w-[339px] lg:w-[620px] "
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="退会する"
      >
        <div className="popup-container__inner">
        {/* タイトル */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            退会する
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
              利用者が退会手続きを進行した場合、会員限定ページ内で閲覧できた情報は一切閲覧できなくなります。退会後会員情報復旧はいたしませんので予めご了承ください。
            </p>

            {/* ユーザー情報 */}
            <div className="flex flex-col gap-[18px] w-full">
              {USER_INFO.map((item, idx) => (
                <div
                  key={item.label}
                  className={`flex flex-col gap-[8px] pt-[18px] border-t ${
                    idx === USER_INFO.length - 1
                      ? "border-b border-[#eff4f8] pb-[18px]"
                      : ""
                  } border-[#eff4f8]`}
                >
                  <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                    {item.label}
                  </p>
                  <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* 退会理由 (기획서: 내용* textarea) */}
            <div className="flex flex-col gap-[8px] w-full">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                内容<span className="text-[#ff1a1a]">*</span>
              </p>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
                placeholder="退会理由を入力してください"
                className={`w-full h-[120px] px-[16px] py-[12px] bg-white border rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] placeholder:text-[#999] outline-none transition-colors duration-150 ${
                  error
                    ? "border-[#ff1a1a]"
                    : "border-[#ebebeb] focus:border-[#101010]"
                }`}
                style={{ resize: "none" }}
              />
              {error && (
                <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
                  {error}
                </p>
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
                className="w-[141px] lg:w-[84px]"
              >
                退会する
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
