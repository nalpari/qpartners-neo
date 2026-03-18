"use client";

import { useState } from "react";
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
    // 성공 시: ID 저장 처리 + router.push("/")
    // 실패 시: setError("IDとパスワードが正しくありません！")
    setError("IDとパスワードが正しくありません！");
  };

  return (
    <main className="flex items-center justify-center lg:min-h-[calc(100vh-78px)]">
      <section className="flex flex-col w-full bg-white px-6 py-[34px] gap-[26px] lg:w-[620px] lg:rounded-2xl lg:shadow-[0px_8px_40px_0px_rgba(0,0,0,0.05)] lg:px-[42px] lg:pt-[34px] lg:pb-[42px] lg:gap-8">
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
    </main>
  );
}
