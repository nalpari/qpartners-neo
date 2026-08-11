"use client";

import { useState } from "react";
import { usePopupStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function SignupCompletePopup() {
  const { popupData, closePopup } = usePopupStore();
  const [isClosing, setIsClosing] = useState(false);

  const userName = (popupData.userName as string) ?? "";
  const userId = (popupData.userId as string) ?? "";
  // 등록 폼 초기화 콜백 — SignupContents 가 주입 (연속 등록 지원).
  const onConfirm = popupData.onConfirm as (() => void) | undefined;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  // 관리자 대리 등록 — 로그인 화면 이동 대신 폼을 초기화해 다음 회원을 이어서 등록한다.
  const handleConfirm = () => {
    handleClose();
    onConfirm?.();
  };

  return (
    // 등록 완료 안내 → 사용자가 [確認] 버튼으로만 닫도록 강제.
    // dim 클릭·X 버튼으로 임의 닫힘 시 폼 초기화 흐름이 끊긴다.
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
    >
      <div
        className="popup-container"
        role="dialog"
        aria-modal="true"
        aria-label="会員登録完了"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            会員登録完了
          </h2>
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-6 w-full">
          {/* 안내 + ID */}
          <div className="flex flex-col gap-2 w-full">
            {/* 안내 박스 */}
            <div className="flex flex-col gap-2 bg-[#F7F9FB] rounded-[4px] px-5 pt-4 pb-5 w-full leading-[1.5]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#E97923] w-full">
                {userName || "登録したユーザー名を表示"}　様
              </p>
              <p className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#101010] w-full">
                一般会員登録が完了しました.
                <br />
                下記情報でログイン後、Q.PARTNERをご利用ください.
              </p>
            </div>

            {/* ID 표시 */}
            <div className="flex flex-col items-start bg-[#F2F2F2] rounded-[4px] px-5 py-4 w-full">
              <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#101010] w-full">
                ID: {userId || "interplug@co.kr"}
              </p>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex flex-col items-center w-full pb-1">
            <Button
              variant="primary"
              onClick={handleConfirm}
              className="w-full lg:w-[149px]"
            >
              確認
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
