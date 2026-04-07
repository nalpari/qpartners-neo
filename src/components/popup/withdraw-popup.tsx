"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { Button, Spinner } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

// Design Ref: §6.1 — 프로필 API 응답 타입
interface ProfileData {
  compNm: string | null;
  sei: string | null;
  mei: string | null;
  email: string | null;
  telNo: string | null;
  withdrawAvailable?: boolean;
}

export function WithdrawPopup() {
  const router = useRouter();
  const { closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const logout = useAuthStore((s) => s.logout);

  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // TODO: mypage/profile API 안정화 후 useQuery로 교체
  // const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery<ProfileData>({
  //   queryKey: ["mypage-profile"],
  //   queryFn: async () => {
  //     const res = await api.get<{ data: ProfileData }>("/mypage/profile");
  //     return res.data.data;
  //   },
  // });
  const profile: ProfileData = {
    compNm: "—",
    sei: "—",
    mei: "",
    email: "—",
    telNo: "—",
    withdrawAvailable: true,
  };
  const isProfileLoading = false;
  const profileError = null;

  const userInfo = [
    { label: "会社名", value: profile.compNm ?? "-" },
    { label: "氏名", value: [profile.sei, profile.mei].filter(Boolean).join(" ") || "-" },
    { label: "メールアドレス (ID)", value: profile.email ?? "-" },
    { label: "電話番号", value: profile.telNo ?? "-" },
  ];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  // Design Ref: §3.2 — 탈퇴 요청
  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("退会理由を入力してください");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/mypage/withdraw", { reason: reason.trim() });
      setIsSubmitting(false);
      // Plan SC: 성공 → alert → 로그아웃 → 홈 이동
      openAlert({
        type: "alert",
        message: "会員退会が完了されました。ご利用ありがとうございます。",
        onConfirm: () => {
          logout();
          closePopup();
          router.push("/");
        },
      });
    } catch (err: unknown) {
      setIsSubmitting(false);
      // Design Ref: §5.2 — 에러 분기 처리
      if (isAxiosError(err) && err.response) {
        const status = err.response.status;
        const data = (err.response.data ?? {}) as Record<string, unknown>;
        const errorMsg = typeof data.error === "string" ? data.error : undefined;

        if (status === 401) {
          openAlert({
            type: "alert",
            message: "ログインが必要です。",
            onConfirm: () => {
              logout();
              closePopup();
              router.push("/login");
            },
          });
        } else if (status === 403) {
          openAlert({ type: "alert", message: errorMsg ?? "退会権限がありません。" });
        } else if (status === 429) {
          openAlert({ type: "alert", message: "しばらくしてからお試しください。" });
        } else if (status === 501) {
          openAlert({ type: "alert", message: "退会機能は現在準備中です。しばらくお待ちください。" });
        } else {
          openAlert({ type: "alert", message: "サーバーエラーが発生しました。しばらくしてからお試しください。" });
        }
      } else {
        console.error("[Withdraw] 탈퇴 처리 실패:", err);
        openAlert({ type: "alert", message: "サーバーエラーが発生しました。しばらくしてからお試しください。" });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleClose();
  };

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onKeyDown={handleKeyDown}
    >
      <div
        className="popup-container w-[339px] lg:w-[620px]"
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

            {/* ユーザー情報 — Design Ref: §7.2 로딩/에러/데이터 분기 */}
            {isProfileLoading ? (
              <div className="flex items-center justify-center py-[40px]">
                <Spinner />
              </div>
            ) : profileError ? (
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#ff1a1a] py-[20px]">
                会員情報を読み込めませんでした
              </p>
            ) : (
              <div className="flex flex-col gap-[18px] w-full">
                {userInfo.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`flex flex-col gap-[8px] pt-[18px] border-t ${
                      idx === userInfo.length - 1
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
            )}

            {/* 退会理由 */}
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

            {/* ボタン — Design Ref: §7.3 버튼 상태 */}
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
                onClick={() => { void handleSubmit(); }}
                disabled={isSubmitting || isProfileLoading || !!profileError}
                className="w-[141px] lg:w-[84px]"
              >
                {isSubmitting ? "処理中..." : "退会する"}
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
