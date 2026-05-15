"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { extractApiError } from "@/lib/api-error";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { performLogout } from "@/lib/auth-client";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { Button } from "@/components/common";

/**
 * 서버 에러 코드 → 일본어 사용자 메시지 매핑.
 * 서버 응답 body 에 `code` 필드가 있으면 코드 기반 매핑(번역/메시지 변경에 강함).
 * 코드가 없으면 레거시 메시지 includes 패턴으로 폴백 (배포 순서·구버전 응답 호환).
 */
const ERROR_CODE_MAP: Record<string, string> = {
  MISMATCH: "認証番号が一致しません！",
  EXPIRED: "入力時間を超過しました。再送信後、もう一度入力してください。",
  MAX_ATTEMPTS: "認証の試行回数を超過しました。認証番号を再送信してください。",
  NOT_SENT: "認証番号を先に送信してください。再送信をお試しください。",
};

const ERROR_MESSAGE_PATTERN_MAP: { pattern: string; message: string }[] = [
  // verify 에러 (BE 일본어 메시지 패턴)
  { pattern: "認証番号が一致しません", message: ERROR_CODE_MAP.MISMATCH },
  { pattern: "入力時間を超過", message: ERROR_CODE_MAP.EXPIRED },
  { pattern: "認証の試行回数を超過", message: ERROR_CODE_MAP.MAX_ATTEMPTS },
  { pattern: "認証番号を先に送信", message: ERROR_CODE_MAP.NOT_SENT },
  // send 에러 (code 미지원 — 메시지 패턴으로만 매칭)
  { pattern: "メール情報がない", message: "メール情報がないため認証番号を送信できません。" },
  { pattern: "送信回数を超え", message: "認証番号の送信回数を超過しました。しばらくしてからお試しください。" },
  { pattern: "認証番号の送信に失敗", message: "認証番号の送信に失敗しました。しばらくしてから再度お試しください。" },
];

function mapServerError(serverMsg: string, code: string | null): string {
  // 1. code 기반 매칭 — 서버 메시지 변경/번역에 영향받지 않음.
  if (code && ERROR_CODE_MAP[code]) return ERROR_CODE_MAP[code];
  // 1-1. code 가 있으나 FE 매핑에 없는 신종 → 서버에 새 code 가 추가됐는데 FE 가 못 따라간 상태.
  //      운영 알람 수준으로 격상해 모니터링이 즉시 인지하도록.
  if (code) {
    console.error("[2FA] 未マッピングのサーバー code:", { code, serverMsg });
  }
  // 2. 레거시 폴백 — 구 응답(혹은 배포 시점 차이)에서 code 미존재 시 메시지 패턴 매칭.
  const match = ERROR_MESSAGE_PATTERN_MAP.find((e) => serverMsg.includes(e.pattern));
  if (!match) {
    console.warn("[2FA] 未認識のサーバーエラー:", { code, serverMsg });
  }
  return match?.message ?? "認証処理中にエラーが発生しました。しばらくしてからお試しください。";
}


export function TwoFactorAuthPopup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const inputRef = useRef<HTMLInputElement>(null);
  // 최초 자동 송신과 수동 재전송 구분 — 수동 재전송 성공 시에만 "재전송됨" 알림을 띄운다.
  // useMutation 의 onSuccess 는 발송 주체를 모르므로 플래그로 분리.
  const isManualResendRef = useRef(false);

  // popupData 타입 가드 — undefined 방어
  const userId = typeof popupData.userId === "string" ? popupData.userId : "";
  const userTp = typeof popupData.userTp === "string" ? popupData.userTp : "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(600);

  const isCodeValid = code.length === 6;

  // 파생 값으로 에러 처리 — useEffect 밖에서 선언
  const missingAuthData = !userId || !userTp;
  const derivedError = missingAuthData
    ? "認証情報が不足しています。ログインからやり直してください。"
    : null;

  // 인증번호 발송 — useMutation으로 관리 (useEffect 내 setState 회피)
  const sendMutation = useMutation({
    mutationFn: () => api.post("/auth/two-factor/send", { userTp, userId }),
    onSuccess: () => {
      startTimer();
      // 수동 재전송에서 트리거된 경우에만 알림. 자동 첫 발송은 팝업 오픈 안내문으로 충분.
      if (isManualResendRef.current) {
        openAlert({
          type: "alert",
          message: "認証番号が再送信されました。",
        });
      }
    },
    onError: (err: Error) => {
      console.error("[2FA] 送信失敗:", err);
      let message: string;
      if (isAxiosError(err) && err.response) {
        const serverError = extractApiError(err);
        const data = err.response.data;
        const code =
          typeof data === "object" && data !== null && "code" in data && typeof (data as Record<string, unknown>).code === "string"
            ? ((data as Record<string, unknown>).code as string)
            : null;
        message = mapServerError(serverError ?? "", code);
      } else {
        message = "認証処理中にエラーが発生しました。しばらくしてからお試しください。";
      }
      // 수동 재전송 실패 시에는 alert 로 명시 (인라인 텍스트만으로는 사용자가 인지 못하는 케이스 방지).
      // 자동 첫 발송 실패 시에는 인라인 에러로 충분 (팝업 본문 자체가 안내문 컨텍스트).
      if (isManualResendRef.current) {
        openAlert({ type: "alert", message });
      } else {
        setError(message);
      }
    },
    onSettled: () => {
      // 성공/실패 무관하게 manual flag 리셋 — onSuccess/onError 분기 누락 방지.
      isManualResendRef.current = false;
    },
  });

  // useRef 기반 타이머 (useEffect 내 setState 회피)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ref로 sendMutation.mutate 안정화 → eslint-disable 제거
  const sendMutateRef = useRef(sendMutation.mutate);
  sendMutateRef.current = sendMutation.mutate;

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRemainingSeconds(600);
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 팝업 열리면 자동 포커스 + 1회 발송 (StrictMode 중복 방지)
  const sendCalledRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
    if (sendCalledRef.current || missingAuthData) return;
    sendCalledRef.current = true;
    sendMutateRef.current();
  }, [missingAuthData]);

  // Issue #2157 — timer cleanup 을 unmount 전용 useEffect 로 분리.
  // 기존: send useEffect 의 cleanup 에서 clearInterval → StrictMode 의 첫 mount cleanup 시점에
  //       빠른 mutate 응답이 이미 onSuccess→startTimer 를 호출했다면 timer 가 즉시 죽고 재시작 X (race).
  // 해결: 컴포넌트 unmount 시에만 timer 정리하도록 빈 deps 의 useEffect 분리.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const timerMinutes = Math.floor(remainingSeconds / 60);
  const timerSeconds = remainingSeconds % 60;
  const timerDisplay = `${timerMinutes}:${String(timerSeconds).padStart(2, "0")}`;
  const isTimerExpired = remainingSeconds <= 0;

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(filtered);
    setError(null);
  };

  // Best-effort logout: 실패해도 로그인 화면으로 이동 (서버 세션은 TTL로 만료)
  const handleCancel = async () => {
    try {
      await performLogout(queryClient);
    } catch (err) {
      console.error("[2FA] ログアウト失敗:", err);
    }
    closePopup();
    router.replace("/login");
  };

  const handleResend = () => {
    // 진단 로그 — 클릭이 실제로 진입했는지 가시화 (브라우저 콘솔에서 확인 가능).
    console.log("[2FA] 再送信 클릭", { isPending: sendMutation.isPending });
    setCode("");
    setError(null);
    inputRef.current?.focus();
    // 이 발송이 수동 재전송임을 플래그로 기록 → onSuccess 에서 알림 노출
    isManualResendRef.current = true;
    sendMutation.mutate();
  };

  const handleVerify = async () => {
    if (!isCodeValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/auth/two-factor/verify", { userTp, userId, code });

      // 성공: 홈화면 블러 해제 (성공 메시지 없음)
      try {
        localStorage.setItem(AUTH_FLAG_KEY, "1");
      } catch (storageErr) {
        console.error("[2FA] localStorage 쓰기 失敗:", storageErr);
        setError("ブラウザのストレージに問題があります。シークレットモードでは正常に動作しない場合があります。");
        return;
      }
      dispatchAuthChange();
      closePopup();
      router.replace("/");
    } catch (err) {
      console.error("[2FA] 認証失敗:", err);
      if (isAxiosError(err) && err.response) {
        const serverError = extractApiError(err);
        // body 에 code 필드가 있으면 추출 — 메시지 매칭보다 안정적.
        const data = err.response.data;
        const code =
          typeof data === "object" && data !== null && "code" in data && typeof (data as Record<string, unknown>).code === "string"
            ? ((data as Record<string, unknown>).code as string)
            : null;
        if (serverError || code) {
          setError(mapServerError(serverError ?? "", code));
        } else {
          console.warn("[2FA] 予期しないエラーレスポンス形式:", err.response.data);
          setError("認証処理中にエラーが発生しました。しばらくしてからお試しください");
        }
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
                {/* 브라우저 자동 번역 모드에서 정적 텍스트(残り時間)와 동적 timerDisplay 가
                    같은 텍스트 노드 라인에 인접하면 번역기가 DOM 노드를 외부 변경 → React
                    reconciliation 실패로 카운트가 멈춘 것처럼 보이는 회귀가 있었음.
                    동적 값을 별도 <span> 으로 감싸 React 가 관리하는 경계를 명확히 한다. */}
                <p className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${
                  isTimerExpired ? "text-[#FF1A1A]" : "text-[#505050]"
                }`}>
                  残り時間 : <span>{timerDisplay}</span>
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
                  className="flex items-center justify-center w-full lg:w-[71px] h-[52px] bg-[rgba(16,16,16,0.7)] border border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-white shrink-0 transition-colors duration-150 hover:bg-[#101010]"
                >
                  再送信
                </button>
              </div>

              {/* 오류 메시지 */}
              {(derivedError || error) && (
                <div className="flex items-center justify-center gap-1 w-full">
                  <Image
                    src="/asset/images/contents/warning_icon.svg"
                    alt=""
                    width={14}
                    height={13}
                  />
                  <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a] text-center">
                    {derivedError || error}
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
