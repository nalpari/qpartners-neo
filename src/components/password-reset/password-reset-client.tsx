"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { loginUserSchema } from "@/lib/schemas/auth";
import { validatePasswordPolicy } from "@/lib/schemas/signup";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import { Button } from "@/components/common";

type SubmitStatus = "idle" | "submitting" | "done";
type PageStatus = "loading" | "invalid" | "ready" | SubmitStatus;

// Issue #2077 — 비밀번호 표시/숨김 토글 아이콘 (눈/눈-가림). aria-label 일본어, type=button 으로 form submit 차단.
// React Compiler `static-components` 룰 — 모듈 scope 로 정의 (다른 컴포넌트 본문 내 정의 금지).
function PasswordToggleButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
      className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 text-[#999] hover:text-[#101010] cursor-pointer"
    >
      {show ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export function PasswordResetClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const token = searchParams.get("token") ?? "";

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoLoginOk, setAutoLoginOk] = useState(false);
  // Issue #2077 — 비밀번호 표시/숨김 토글 (입력창 우측 아이콘)
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 1. 토큰 검증 (TanStack Query)
  const { data: verifyData, error: verifyError, isLoading } = useQuery({
    queryKey: ["password-reset", "verify", token],
    queryFn: async () => {
      const res = await api.post("/auth/password-reset/verify", { token });
      return res.data;
    },
    enabled: !!token,
    retry: false,
  });

  // 파생 상태로 status 결정
  const status: PageStatus = !token
    ? "invalid"
    : submitStatus !== "idle"
      ? submitStatus
      : isLoading
        ? "loading"
        : verifyError
          ? "invalid"
          : verifyData
            ? "ready"
            : "loading";

  // invalid 상태의 에러 메시지 (토큰 검증 실패 시)
  const invalidError = (() => {
    if (isAxiosError(verifyError) && verifyError.response) {
      const data = verifyError.response.data as Record<string, unknown> | undefined;
      return typeof data?.error === "string" ? data.error : "無効または期限切れのリンクです。";
    }
    if (isAxiosError(verifyError) && !verifyError.response) {
      return "サーバーに接続できません。しばらくしてからもう一度お試しください。";
    }
    return verifyError instanceof Error ? verifyError.message : null;
  })();

  // 2. 비밀번호 변경 제출
  const handleSubmit = async () => {
    setError(null);

    if (!validatePasswordPolicy(newPassword)) {
      setError("英大文字、英小文字、数字を組み合わせて8文字以上で設定してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setSubmitStatus("submitting");

    try {
      const res = await api.post("/auth/password-reset/confirm", {
        token,
        newPassword,
        confirmPassword,
      });

      // 자동 로그인: JWT 쿠키는 API가 설정, 프론트에서 user 캐시 + 플래그 설정
      const rawUser = res.data?.data?.user;
      const parsed = rawUser ? loginUserSchema.safeParse(rawUser) : null;
      const userData = parsed?.success ? parsed.data : null;

      if (userData) {
        queryClient.setQueryData(["auth", "login-user-info"], userData);
        try {
          localStorage.setItem(AUTH_FLAG_KEY, "1");
        } catch (storageErr) {
          console.error("[PasswordResetClient] localStorage 쓰기 실패:", storageErr);
        }
        dispatchAuthChange();
        setAutoLoginOk(true);
      } else {
        console.warn("[PasswordResetClient] 自動ログインデータ欠落 — ログインページへリダイレクト");
      }

      setSubmitStatus("done");

      // 1500ms — 유저가 완료 메시지를 읽을 시간 확보 후 리다이렉트
      setTimeout(() => {
        router.replace(userData ? "/" : "/login");
      }, 1500);
    } catch (err) {
      console.error("[PasswordResetClient] パスワード変更失敗:", err);
      if (isAxiosError(err) && err.response) {
        const data = err.response.data as Record<string, unknown> | undefined;
        const serverMsg = typeof data?.error === "string"
          ? data.error
          : "エラーが発生しました。";
        setError(serverMsg);
      } else if (isAxiosError(err) && err.code === "ECONNABORTED") {
        setError("サーバーからの応答がありません。しばらくしてからもう一度お試しください。");
      } else {
        setError("サーバーに接続できません。しばらくしてからもう一度お試しください。");
      }
      setSubmitStatus("idle");
    }
  };

  const inputClass =
    "w-full h-[42px] px-4 pr-11 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]";
  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-['Noto_Sans_JP'] text-sm text-[#999]">読み込み中...</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="font-['Noto_Sans_JP'] text-sm text-[#FF1A1A]">
            {invalidError ?? "無効または期限切れのリンクです。"}
          </p>
          <Button variant="primary" onClick={() => router.replace("/login")}>
            ログインへ戻る
          </Button>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-['Noto_Sans_JP'] text-sm text-[#101010]">
          {autoLoginOk
            ? "保存されました。ホームに移動します..."
            : "パスワードが変更されました。ログインページに移動します..."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="border-b-2 border-[#E97923] pb-3">
          <h1 className="font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            会員情報設定
          </h1>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            新しいパスワード<span className="text-[#FF1A1A]">*</span>
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <PasswordToggleButton
              show={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
            />
          </div>
          <p className="font-['Noto_Sans_JP'] text-[12px] text-[#999] leading-[1.5]">
            ※ 英大文字、英小文字、数字を組み合わせて8文字以上で設定
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            新しいパスワード再入力<span className="text-[#FF1A1A]">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
            <PasswordToggleButton
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
            />
          </div>
        </div>

        {error && (
          <p className="font-['Noto_Sans_JP'] text-[13px] text-[#FF1A1A] leading-[1.5]">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => router.replace("/login")}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => { void handleSubmit(); }}
            disabled={status === "submitting"}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
