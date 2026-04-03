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

  // 1. 토큰 검증 (TanStack Query)
  const { data: verifyData, error: verifyError, isLoading } = useQuery({
    queryKey: ["password-reset", "verify", token],
    queryFn: async () => {
      const res = await api.post("/auth/password-reset/verify", { token });
      return res.data;
    },
    enabled: !!token,
    retry: (_, err) => {
      // 400/404 등 토큰 무효는 재시도 무의미
      if (isAxiosError(err) && err.response && err.response.status < 500) return false;
      return false;
    },
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
        const serverMsg = typeof err.response.data?.error === "string"
          ? err.response.data.error
          : "エラーが発生しました。";
        setError(serverMsg);
      } else {
        setError("サーバーに接続できません。しばらくしてからもう一度お試しください。");
      }
      setSubmitStatus("idle");
    }
  };

  const inputClass =
    "w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]";
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
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <p className="font-['Noto_Sans_JP'] text-[12px] text-[#999] leading-[1.5]">
            ※ 英大文字、英小文字、数字を組み合わせて8文字以上で設定
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            新しいパスワード再入力<span className="text-[#FF1A1A]">*</span>
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
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
            onClick={handleSubmit}
            disabled={status === "submitting"}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
