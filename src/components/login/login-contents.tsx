"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { Spinner } from "@/components/common/spinner";
import { LoginTabs } from "@/components/login/login-tabs";
import { LoginForm } from "@/components/login/login-form";
import { LoginLinks } from "@/components/login/login-links";

type TabType = "dealer" | "installer" | "general";

const TAB_TO_USERTP: Record<TabType, string> = {
  dealer: "DEALER",
  installer: "SEKO",
  general: "GENERAL",
};

const SAVED_ID_KEY = "savedLoginId";

export function LoginContents() {
  const [activeTab, setActiveTab] = useState<TabType>("dealer");
  const [id, setId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(SAVED_ID_KEY) ?? "";
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SAVED_ID_KEY) !== null;
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setId("");
    setPassword("");
    setShowPassword(false);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!id.trim()) {
      setError("IDを入力してください");
      return;
    }
    if (!password) {
      setError("パスワードを入力してください");
      return;
    }
    if (!agreeTerms) {
      setError("利用規約に同意してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/auth/login", {
        loginId: id,
        pwd: password,
        userTp: TAB_TO_USERTP[activeTab],
      });

      if (saveId) {
        localStorage.setItem(SAVED_ID_KEY, id);
      } else {
        localStorage.removeItem(SAVED_ID_KEY);
      }

      router.push("/");
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const status = err.response.status;
        if (status === 401) {
          setError("IDとパスワードが正しくありません！");
        } else if (status === 502) {
          setError("サーバーに接続できません。しばらくしてからお試しください");
        } else if (status === 400) {
          setError("入力内容を確認してください");
        } else {
          setError("ログインに失敗しました");
        }
      } else {
        setError("サーバーに接続できません。しばらくしてからお試しください");
      }
    } finally {
      setIsSubmitting(false);
    }
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
