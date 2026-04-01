"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/common";
import { AUTH_FLAG_KEY, dispatchAuthChange } from "@/components/login/types";
import type { LoginUser } from "@/lib/schemas/auth";

type Status = "loading" | "invalid" | "ready" | "submitting" | "done";

export function PasswordResetClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>(() => token ? "loading" : "invalid");
  const [email, setEmail] = useState("");
  const [emailEditable, setEmailEditable] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 1. 토큰 검증
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/password-reset/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (!res.ok) {
          setStatus("invalid");
          return;
        }

        const json = await res.json();
        setEmail(json.data.userId ?? "");
        setEmailEditable(!json.data.userId);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  // 2. 비밀번호 변경 제출
  const handleSubmit = useCallback(async () => {
    setError(null);

    if (newPassword.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasUpper || !hasLower || !hasNumber) {
      setError("英大文字、英小文字、数字を組み合わせて8文字以上で設定してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "エラーが発生しました。");
        setStatus("ready");
        return;
      }

      // 자동 로그인: JWT 쿠키는 API가 설정, 프론트에서 user 캐시 + 플래그 설정
      const userData = json.data?.user as LoginUser | undefined;
      if (userData) {
        queryClient.setQueryData(["auth", "login-user-info"], userData);
        localStorage.setItem(AUTH_FLAG_KEY, "1");
        dispatchAuthChange();
      }

      setStatus("done");

      // Alert 대신 페이지에서 성공 표시 후 리다이렉트
      setTimeout(() => {
        router.replace("/");
      }, 1500);
    } catch {
      setError("サーバーに接続できません。しばらくしてからもう一度お試しください。");
      setStatus("ready");
    }
  }, [token, newPassword, confirmPassword, queryClient, router]);

  const inputClass =
    "w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]";
  const readonlyInputClass =
    "w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#999] outline-none";
  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  // 로딩 중
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-['Noto_Sans_JP'] text-sm text-[#999]">読み込み中...</p>
      </div>
    );
  }

  // 무효한 토큰
  if (status === "invalid") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="font-['Noto_Sans_JP'] text-sm text-[#FF1A1A]">
            無効または期限切れのリンクです。
          </p>
          <Button variant="primary" onClick={() => router.replace("/login")}>
            ログインへ戻る
          </Button>
        </div>
      </div>
    );
  }

  // 완료
  if (status === "done") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-['Noto_Sans_JP'] text-sm text-[#101010]">
          保存されました。ホームに移動します...
        </p>
      </div>
    );
  }

  // 비밀번호 변경 폼
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        {/* 타이틀 */}
        <div className="border-b-2 border-[#E97923] pb-3">
          <h1 className="font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            会員情報設定
          </h1>
        </div>

        {/* 이메일 */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            E-Mail{emailEditable && <span className="text-[#FF1A1A]">*</span>}
          </label>
          {emailEditable ? (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          ) : (
            <div className={readonlyInputClass}>
              <span className="leading-[42px]">{email}</span>
            </div>
          )}
        </div>

        {/* 신규 비밀번호 */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            新しいパスワード<span className="text-[#FF1A1A]">*</span>
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <p className="font-['Noto_Sans_JP'] text-[12px] text-[#999] leading-[1.5]">
            ※ 英大文字、英小文字、数字を組み合わせて8文字以上で設定
          </p>
        </div>

        {/* 비밀번호 재입력 */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            新しいパスワード再入力<span className="text-[#FF1A1A]">*</span>
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p className="font-['Noto_Sans_JP'] text-[13px] text-[#FF1A1A] leading-[1.5]">
            {error}
          </p>
        )}

        {/* 버튼 */}
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
