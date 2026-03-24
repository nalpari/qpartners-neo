"use client";

import { useState } from "react";
import { useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function AlertDialog() {
  const { isOpen, options, closeAlert } = useAlertStore();
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen || !options) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      options.onCancel?.();
      closeAlert();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleConfirm = () => {
    setIsClosing(true);
    setTimeout(() => {
      options.onConfirm?.();
      closeAlert();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
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
        className="bg-white flex flex-col gap-[18px] overflow-hidden p-[24px] rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] w-[339px] lg:w-[350px] animate-[popup-slide-in_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {/* 메시지 영역 */}
        <div className="bg-[#f7f9fb] border border-[#e2e9f1] rounded-[12px] p-[24px] w-full">
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] text-center whitespace-pre-line">
            {options.message}
          </p>
        </div>

        {/* 버튼 영역 */}
        <div className="flex gap-[8px] items-center justify-center w-full">
          {options.type === "confirm" && (
            <Button
              variant="secondary"
              onClick={handleClose}
              className="w-[97px]"
            >
              {options.cancelLabel ?? "キャンセル"}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleConfirm}
            className= "w-[68px]"
          >
            {options.confirmLabel ?? "確認"}
          </Button>
        </div>
      </div>
    </div>
  );
}
