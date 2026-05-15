"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePopupStore, useAppStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function SignupCompletePopup() {
  const router = useRouter();
  const { popupData, closePopup } = usePopupStore();
  const setPrefillEmail = useAppStore((s) => s.setPrefillEmail);
  const [isClosing, setIsClosing] = useState(false);

  const userName = (popupData.userName as string) ?? "";
  const userId = (popupData.userId as string) ?? "";

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  // Design Ref: §5.3 — 로그인 이동 시 ID 자동입력을 위해 prefillEmail 설정
  const handleGoLogin = () => {
    setPrefillEmail(userId);
    handleClose();
    router.push("/login");
  };

  return (
    // 회원가입 완료 안내 → 사용자가 [ログイン画面に移動] 버튼으로만 닫도록 강제.
    // dim 클릭·X 버튼으로 임의 닫힘 시 prefillEmail 설정 + 로그인 화면 이동 흐름이 끊긴다.
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
              onClick={handleGoLogin}
              className="w-full lg:w-[149px]"
            >
              ログイン画面に移動
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
