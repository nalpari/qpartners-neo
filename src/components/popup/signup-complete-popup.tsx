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
  const onConfirm = popupData.onConfirm as (() => void) | undefined;
  // 완료 메일 발송 결과 — 서버가 mailDelivery="failed" 를 보내면(등록은 성공, 메일만 실패)
  // 관리자에게 회원 별도 연락을 안내한다. 미전달 시 성공으로 간주.
  const mailFailed = popupData.mailDelivery === "failed";

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  // 관리자 대리등록 흐름 — 확인 시 팝업을 닫고 등록 폼을 초기화(연속 등록)한다.
  // 셀프가입 폐지로 로그인 화면 이동/ID 자동입력 로직은 제거됨.
  const handleConfirm = () => {
    handleClose();
    onConfirm?.();
  };

  return (
    // 회원등록 완료 안내 — dim 클릭·X 버튼 핸들러를 두지 않아 [確認] 버튼으로만 닫힌다.
    // 확인 경로로만 폼 초기화(연속 등록)가 이어지도록 닫기 수단을 의도적으로 단일화했다.
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
                下記IDで登録されました.
              </p>
            </div>

            {/* ID 표시 */}
            <div className="flex flex-col items-start bg-[#F2F2F2] rounded-[4px] px-5 py-4 w-full">
              <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#101010] w-full">
                ID: {userId || "interplug@co.kr"}
              </p>
            </div>

            {/* 완료 메일 발송 실패 안내 — 등록은 완료됐으나 통지 메일이 실패한 경우 */}
            {mailFailed && (
              <div className="flex flex-col bg-[#FDF2F2] border border-[#F5C2C2] rounded-[4px] px-5 py-4 w-full leading-[1.5]">
                <p className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#C0392B] w-full">
                  完了メールの送信に失敗しました。
                  <br />
                  会員へ別途ご連絡ください。
                </p>
              </div>
            )}
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
