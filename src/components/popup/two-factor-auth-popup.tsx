"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { usePopupStore } from "@/lib/store";
import { performLogout } from "@/lib/auth-client";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { Button } from "@/components/common";

/** 서버 에러 메시지 → 일본어 사용자 메시지 매핑 */
const ERROR_MESSAGE_MAP: { pattern: string; message: string }[] = [
  { pattern: "일치하지 않습니다", message: "認証番号が一致しません！" },
  { pattern: "입력시간이 초과", message: "入力時間を超過しました。再送信後、もう一度入力してください。" },
  { pattern: "시도 횟수를 초과", message: "認証の試行回数を超過しました。認証番号を再送信してください。" },
  { pattern: "먼저 발송", message: "認証番号を先に送信してください。再送信をお試しください。" },
];

function mapServerError(serverMsg: string): string {
  const match = ERROR_MESSAGE_MAP.find((e) => serverMsg.includes(e.pattern));
  if (!match) {
    console.warn("[2FA] 未認識のサーバーエラー:", serverMsg);
  }
  return match?.message ?? "サーバーに接続できません。しばらくしてからお試しください";
}

/** unknown → string 안전 추출 */
function extractErrorString(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const msg = (data as Record<string, unknown>).error;
    if (typeof msg === "string") return msg;
  }
  return "";
}

export function TwoFactorAuthPopup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { popupData, closePopup } = usePopupStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // popupData 타입 가드 — undefined 방어
  const userId = typeof popupData.userId === "string" ? popupData.userId : "";
  const userTp = typeof popupData.userTp === "string" ? popupData.userTp : "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [isSendSuccess, setIsSendSuccess] = useState(false);

  const isCodeValid = code.length === 6;

  // 인증번호 발송 (async 분리 — React Compiler purity 준수)
  const sendInitial = async () => {
    if (!userId || !userTp) {
      console.error("[2FA] popupData に userId または userTp がありません", { userId, userTp });
      setError("認証情報が不足しています。ログインからやり直してください。");
      return;
    }
    try {
      await api.post("/auth/two-factor/send", { userTp, userId });
      setIsSendSuccess(true);
    } catch (err) {
      console.error("[2FA] 初期送信失敗:", err);
      if (err instanceof AxiosError && err.response?.status === 429) {
        setError("認証番号の送信回数を超過しました。しばらくしてからお試しください。");
      } else {
        setError("メール送信に失敗しました。再送信をお試しください。");
      }
    }
  };

  // 팝업 열리면 자동 포커스 + 1회 발송 (StrictMode 중복 방지)
  const sendCalledRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
    if (sendCalledRef.current) return;
    sendCalledRef.current = true;
    void sendInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 실행
  }, []);

  // 10분 카운트다운 타이머 — 발송 성공 시에만 시작
  useEffect(() => {
    if (!isSendSuccess) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSendSuccess]);

  const timerMinutes = Math.floor(remainingSeconds / 60);
  const timerSeconds = remainingSeconds % 60;
  const timerDisplay = `${timerMinutes}:${String(timerSeconds).padStart(2, "0")}`;
  const isTimerExpired = remainingSeconds <= 0;

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(filtered);
    setError(null);
  };

  const handleCancel = async () => {
    try {
      await performLogout(queryClient);
    } catch (err) {
      console.error("[2FA] ログアウト失敗:", err);
    }
    closePopup();
    router.replace("/login");
  };

  const handleResend = async () => {
    setCode("");
    setError(null);
    inputRef.current?.focus();
    try {
      await api.post("/auth/two-factor/send", { userTp, userId });
      setRemainingSeconds(600);
      setIsSendSuccess(true);
    } catch (err) {
      console.error("[2FA] 再送信失敗:", err);
      if (err instanceof AxiosError && err.response?.status === 429) {
        setError("認証番号の送信回数を超過しました。しばらくしてからお試しください。");
      } else {
        setError("メール送信に失敗しました。再送信をお試しください。");
      }
    }
  };

  const handleVerify = async () => {
    if (!isCodeValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/auth/two-factor/verify", { userTp, userId, code });

      // 성공: 홈화면 블러 해제 (성공 메시지 없음)
      localStorage.setItem(AUTH_FLAG_KEY, "1");
      dispatchAuthChange();
      closePopup();
      router.replace("/");
    } catch (err) {
      console.error("[2FA] 認証失敗:", err);
      if (err instanceof AxiosError && err.response) {
        const serverError = extractErrorString(err.response.data);
        setError(mapServerError(serverError));
      } else {
        setError("サーバーに接続できません。しばらくしてからお試しください");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="popup-overlay"
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
                  onClick={() => { void handleResend(); }}
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
              <Button variant="secondary" onClick={() => { void handleCancel(); }}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={() => { void handleVerify(); }}
                disabled={!isCodeValid || isSubmitting}
              >
                {isSubmitting ? "確認中..." : "確認"}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
