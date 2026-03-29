"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePopupStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function TwoFactorAuthPopup() {
  const router = useRouter();
  const { closePopup } = usePopupStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(600);

  const isCodeValid = code.length === 6;

  // 팝업 열리면 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 10분 카운트다운 타이머
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  const timerMinutes = Math.floor(remainingSeconds / 60);
  const timerSeconds = remainingSeconds % 60;
  const timerDisplay = `${timerMinutes}:${String(timerSeconds).padStart(2, "0")}`;
  const isTimerExpired = remainingSeconds <= 0;

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(filtered);
    setError(null);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setCode("");
      setError(null);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleCancel = () => {
    handleClose();
    router.push("/login");
  };

  const handleResend = () => {
    setCode("");
    setError(null);
    setRemainingSeconds(600);
    inputRef.current?.focus();
    // TODO: POST /api/auth/two-factor/resend
  };

  const handleVerify = () => {
    if (!isCodeValid) return;
    // TODO: POST /api/auth/two-factor/verify
    // 성공: handleClose() → router.push("/")
    // 실패: setError(...)
    // 현재(API 미연동): 무조건 실패로 처리
    setError("認証番号が一致しません！");
  };

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
    >
      <div
        className="popup-container gap-[26px] lg:gap-8"
        role="dialog"
        aria-modal="true"
        aria-label="2段階認証"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center justify-center w-full">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[20px] leading-[1.5] text-[#101010] text-center">
            2段階認証
          </h2>
        </div>

        {/* 본문 */}
        <div className="flex flex-col items-start w-full gap-[24px] lg:gap-[42px]">
          {/* 안내 문구 박스 */}
          <div className="flex flex-col items-start bg-[#f1f3f5] rounded-[12px] px-6 py-7 w-full">
            <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#101010] text-center w-full whitespace-pre-wrap">
              <span className="text-[#e97923]">会員様のメールアドレス</span>
              <span className="font-normal">
                {"で '2段階認証' 通知メールが送信されました.\nメールに含まれる"}
              </span>
              <span className="text-[#e97923]">認証番号の6桁</span>
              <span className="font-normal">
                {"を入力してください.\n認証番号を入力しなければサイトを利用できません.\n認証をキャンセルするとログイン画面に移動します."}
              </span>
            </p>
          </div>

          {/* 인증번호 + 재전송 + 오류 + 버튼 */}
          <div className="flex flex-col items-center w-full gap-6">
            {/* 타이머 + 인증번호 입력 + 재전송 */}
            <div className="flex flex-col w-full gap-3">
              {/* 残り時間 */}
              <div className="flex items-center gap-1.5">
                <Image
                  src="/asset/images/contents/clock_icon.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="shrink-0"
                />
                <p className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${
                  isTimerExpired ? "text-[#FF1A1A]" : "text-[#505050]"
                }`}>
                  残り時間 : {timerDisplay}
                </p>
              </div>

              <div className="flex flex-col gap-6">
              <div className="flex flex-col lg:flex-row items-start gap-2 w-full">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="認証番号入力 (10分以内)"
                  className="w-full lg:flex-1 h-[52px] px-4 bg-white border-2 border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] outline-none placeholder:text-[#999]"
                />
                <button
                  type="button"
                  onClick={handleResend}
                  className="flex items-center justify-center w-full lg:w-[71px] h-[52px] bg-[rgba(16,16,16,0.7)] border border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white shrink-0"
                >
                  再送信
                </button>
              </div>

              {/* 오류 메시지 */}
              {error && (
                <div className="flex items-center justify-center gap-1 w-full">
                  <Image
                    src="/asset/images/contents/warning_icon.svg"
                    alt=""
                    width={14}
                    height={13}
                  />
                  <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a] text-center">
                    {error}
                  </p>
                </div>
              )}
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="popup-buttons--inline">
              <Button variant="secondary" onClick={handleCancel}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={handleVerify}
                disabled={!isCodeValid}
              >
                確認
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
