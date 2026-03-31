"use client";

import { useState } from "react";
import Image from "next/image";
import { usePopupStore } from "@/lib/store";
import { LoginTabs } from "@/components/login/login-tabs";
import { LoginForm } from "@/components/login/login-form";
import { LoginLinks } from "@/components/login/login-links";

type TabType = "dealer" | "installer" | "general";

export function LoginContents() {
  const [activeTab, setActiveTab] = useState<TabType>("dealer");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openPopup = usePopupStore((s) => s.openPopup);

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
    if (!password) {
      setError("パスワードを入力してください");
      return;
    }
    if (!agreeTerms) {
      setError("利用規約に同意してください");
      return;
    }

    // TODO: API 호출 (추후 구현)
    // 테스트: 로그인 성공 시 2단계 인증 팝업 열기
    openPopup("two-factor-auth");
  };

  return (
    <main className="flex items-start justify-center w-full mt-[10px] lg:mt-0  lg:pb-[120px]">
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
