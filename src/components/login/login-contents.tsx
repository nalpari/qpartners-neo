"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import type { LoginUser } from "@/lib/schemas/auth";
import { usePopupStore } from "@/lib/store";
import { Spinner } from "@/components/common/spinner";
import { LoginTabs } from "@/components/login/login-tabs";
import { LoginForm } from "@/components/login/login-form";
import { LoginLinks } from "@/components/login/login-links";
import { SAVED_ID_KEY, SAVED_TAB_KEY, AUTH_FLAG_KEY, dispatchAuthChange, LOGIN_ERRORS } from "@/components/login/types";
import type { TabType } from "@/components/login/types";

const STATUS_ERROR_MAP: Record<number, string> = {
  400: LOGIN_ERRORS.BAD_REQUEST,
  401: LOGIN_ERRORS.INVALID_CREDENTIALS,
  502: LOGIN_ERRORS.SERVER_UNAVAILABLE,
};

const TAB_TO_USERTP: Record<TabType, string> = {
  dealer: "DEALER",
  installer: "SEKO",
  general: "GENERAL",
};

interface LoginContentsProps {
  initialSavedId?: string;
  initialSavedTab?: TabType;
}

export function LoginContents({ initialSavedId = "", initialSavedTab = "dealer" }: LoginContentsProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialSavedTab);
  const [id, setId] = useState(initialSavedId);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(initialSavedId !== "");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const openPopup = usePopupStore((s) => s.openPopup);

  const loginMutation = useMutation({
    mutationFn: async (params: { loginId: string; pwd: string; userTp: string }) => {
      const res = await api.post<{ data: LoginUser }>("/auth/login", params);
      return res.data.data;
    },
    onSuccess: (userData, variables) => {
      if (saveId) {
        localStorage.setItem(SAVED_ID_KEY, variables.loginId);
      } else {
        localStorage.removeItem(SAVED_ID_KEY);
      }
      localStorage.setItem(SAVED_TAB_KEY, activeTab);

      if (!userData.twoFactorVerified) {
        // 2FA 미완료: 인증 플래그 미설정, 헤더는 비로그인 유지
        openPopup("two-factor-auth", { userId: userData.userId, email: userData.email, userTp: TAB_TO_USERTP[activeTab] });
      } else {
        // 2FA 완료 또는 미요구: 캐시 세팅 → 플래그 설정 → 이벤트 발행 순서 보장
        queryClient.setQueryData(["auth", "login-user-info"], userData);
        localStorage.setItem(AUTH_FLAG_KEY, "1");
        dispatchAuthChange();
        router.replace("/");
      }
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response) {
        setError(STATUS_ERROR_MAP[err.response.status] ?? LOGIN_ERRORS.GENERIC);
      } else {
        setError(LOGIN_ERRORS.SERVER_UNAVAILABLE);
      }
    },
  });

  const isSubmitting = loginMutation.isPending;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setId("");
    setPassword("");
    setShowPassword(false);
    setError(null);
  };

  const handleSubmit = () => {
    if (!id.trim()) {
      setError("IDを入力してください");
      return;
    }
    if (!password.trim()) {
      setError("パスワードを入力してください");
      return;
    }
    if (!agreeTerms) {
      setError("利用規約に同意してください");
      return;
    }

    setError(null);
    loginMutation.mutate({
      loginId: id,
      pwd: password,
      userTp: TAB_TO_USERTP[activeTab],
    });
  };

  return (
    <main className="flex items-start justify-center w-full mt-[10px] lg:mt-0  lg:pb-[120px]">
      {/* 로딩 오버레이 — fixed 전체 화면 dim */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Spinner size={48} className="text-white" />
        </div>
      )}
      <div className="flex w-full bg-white overflow-hidden lg:max-w-[1440px] lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
        {/* PC 좌측 — 이미지 패널 */}
        <div className="hidden lg:flex relative flex-col items-start overflow-hidden rounded-l-[12px] w-[860px] shrink-0 min-h-[600px]">
          <Image
            src="/asset/images/contents/login_img.png"
            alt=""
            fill
            sizes="860px"
            className="object-cover"
            priority
          />
          
        </div>

        {/* 우측 — 로그인 폼 */}
        <section className="flex flex-col flex-1 w-full px-6 py-[34px] gap-[26px] lg:p-[80px] lg:gap-8">
          <LoginTabs activeTab={activeTab} onChange={handleTabChange} />
          <LoginForm
            activeTab={activeTab}
            id={id}
            password={password}
            showPassword={showPassword}
            saveId={saveId}
            agreeTerms={agreeTerms}
            error={error}
            isSubmitting={isSubmitting}
            onIdChange={(v) => { setId(v); setError(null); }}
            onPasswordChange={(v) => { setPassword(v); setError(null); }}
            onTogglePassword={() => setShowPassword((prev) => !prev)}
            onSaveIdChange={setSaveId}
            onAgreeTermsChange={setAgreeTerms}
            onClearId={() => { setId(""); setError(null); }}
            onSubmit={handleSubmit}
          />
          <LoginLinks activeTab={activeTab} />
        </section>
      </div>
    </main>
  );
}
