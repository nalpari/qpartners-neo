"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { loginUserSchema } from "@/lib/schemas/auth";
import { validatePasswordPolicy } from "@/lib/schemas/signup";
import { performLogout } from "@/lib/auth-client";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, InputBox } from "@/components/common";

export function PersonalInfoPopup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();

  const currentEmail = popupData.currentEmail as string | undefined;
  const hasExistingEmail = !!currentEmail;

  const [email, setEmail] = useState("");
  const [emailChecked, setEmailChecked] = useState(false);
  const [emailCheckResult, setEmailCheckResult] = useState<"ok" | "fail" | "invalid" | "error" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Design Ref: §4.2.4 — validatePasswordPolicy 재사용
  const isPasswordValid = validatePasswordPolicy(newPassword);

  // Design Ref: §3.5 — 저장 버튼 활성화 조건
  const isFormValid =
    (hasExistingEmail || (email.trim() !== "" && emailChecked && emailCheckResult === "ok")) &&
    isPasswordValid &&
    confirmPassword.length > 0 &&
    confirmPassword === newPassword;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailChecked(false);
    setEmailCheckResult(null);
  };

  // Design Ref: §4.2.1 — POST /api/auth/email/check 연동
  const handleEmailCheck = async () => {
    if (email.trim() === "") return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailCheckResult("invalid");
      return;
    }
    try {
      await api.post("/auth/email/check", { email });
      setEmailChecked(true);
      setEmailCheckResult("ok");
    } catch (err) {
      console.error("[PersonalInfo] メール重複チェック失敗:", err);
      if (isAxiosError(err) && err.response?.status === 409) {
        setEmailCheckResult("fail");
      } else {
        setEmailCheckResult("error");
      }
    }
  };

  // Design Ref: §4.2.2 — 호출 경로에 따라 API 분기
  const handleSave = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = popupData.token as string | undefined;
      let res;

      if (token) {
        // 비밀번호 리셋 링크 경유 → 토큰 기반
        res = await api.post("/auth/password-reset/confirm", {
          token,
          newPassword,
        });
      } else {
        // 최초 로그인 → 세션(JWT) 기반
        res = await api.post("/auth/password-change", {
          newPassword,
          ...(email && !hasExistingEmail && { email }),
        });
      }

      // JWT 쿠키는 서버에서 자동 설정됨
      const userData = loginUserSchema.safeParse(res.data.data?.user);
      if (userData.success) {
        queryClient.setQueryData(["auth", "login-user-info"], userData.data);
      }
      try {
        localStorage.setItem(AUTH_FLAG_KEY, "1");
      } catch (storageErr) {
        console.error("[PersonalInfo] localStorage 쓰기 失敗:", storageErr);
      }
      dispatchAuthChange();
      closePopup();
      openAlert({ type: "alert", message: "保存されました。" });
      router.replace("/");
    } catch (err) {
      console.error("[PersonalInfo] 保存失敗:", err);
      if (isAxiosError(err) && err.response) {
        setError("保存に失敗しました。しばらくしてからお試しください。");
      } else {
        setError("サーバーに接続できません。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Design Ref: §4.2.3 — 취소 시 로그아웃 + 로그인 이동
  const handleCancel = async () => {
    try {
      await performLogout(queryClient);
    } catch (err) {
      console.error("[PersonalInfo] ログアウト失敗:", err);
    }
    closePopup();
    router.replace("/login");
  };

  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  return (
    <div className="popup-overlay">
      <div
        className="popup-container"
        role="dialog"
        aria-modal="true"
        aria-label="会員情報の設定"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            <span className="hidden lg:inline">会員情報の設定</span>
            <span className="lg:hidden">個人情報設定</span>
          </h2>
          <button
            type="button"
            onClick={() => { void handleCancel(); }}
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

        {/* 본문 */}
        <div className="flex flex-col gap-[24px] w-full">
          <div className="flex flex-col gap-[16px] w-full">
            {/* Eメール 필드 */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                Eメール
                <span className="text-[#FF1A1A]">*</span>
              </label>
              {hasExistingEmail ? (
                <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                  <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                    {currentEmail}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex flex-col lg:flex-row gap-2 items-start w-full">
                    <InputBox
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      className="lg:flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => { void handleEmailCheck(); }}
                      className="w-full lg:w-[110px] shrink-0"
                    >
                      重複チェック
                    </Button>
                  </div>
                  {emailCheckResult === "ok" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#22C55E]">
                      使用可能なメールアドレスです。
                    </p>
                  )}
                  {emailCheckResult === "invalid" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a]">
                      正しくないメールアドレスです。
                    </p>
                  )}
                  {emailCheckResult === "fail" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a]">
                      既に使用中のメールです.
                    </p>
                  )}
                  {emailCheckResult === "error" && (
                    <p className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#ff1a1a]">
                      メールチェック中にエラーが発生しました。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 新規パスワード */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                新規パスワード
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="relative w-full">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8文字以上入力してください"
                  className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[6px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#999]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label={showNewPassword ? "パスワードを非表示" : "パスワードを表示"}
                >
                  <Image
                    src={showNewPassword ? "/asset/images/contents/default_eye_show.svg" : "/asset/images/contents/default_eye_hide.svg"}
                    alt=""
                    width={20}
                    height={14}
                  />
                </button>
              </div>
              <p className="font-['Noto_Sans_JP'] font-normal text-[13px] lg:text-[14px] leading-[1.5] text-[#1060b4]">
                ※英語/数字/記号のうち2つ以上を組み合わせて8文字以上に設定
              </p>
            </div>

            {/* 新規パスワード再入力 */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                新規パスワード再入力
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="relative w-full">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-[42px] px-4 pr-12 bg-white border border-[#EBEBEB] rounded-[6px] font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label={showConfirmPassword ? "パスワードを非表示" : "パスワードを表示"}
                >
                  <Image
                    src={showConfirmPassword ? "/asset/images/contents/default_eye_show.svg" : "/asset/images/contents/default_eye_hide.svg"}
                    alt=""
                    width={20}
                    height={14}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#FF1A1A] leading-[1.5] text-center">
              {error}
            </p>
          )}

          {/* 하단 버튼 */}
          <div className="popup-buttons--inline">
            <Button variant="secondary" onClick={() => { void handleCancel(); }}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={() => { void handleSave(); }}
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
