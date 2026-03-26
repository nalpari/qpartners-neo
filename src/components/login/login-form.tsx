"use client";

import Image from "next/image";
import { Checkbox } from "@/components/common/checkbox";
import { Button } from "@/components/common/button";
import { usePopupStore } from "@/lib/store";

type TabType = "dealer" | "installer" | "general";

const TAB_CONFIG = {
  dealer: {
    title: "当社の見積設計システムをご利用のお客様",
    description:
      "※ HANASYS DESIGN/Q.ORDER/Q.MUSUBIと同じID/パスワードを入力してください",
    idPlaceholder: "IDを入力してください",
    pwPlaceholder: "パスワードを入力してください",
  },
  installer: {
    title: "当社にて発行した施工IDをお持ちのお客様",
    description:
      "※ メールまたは施工IDを入力してください。パスワードをお持ちでない方はパスワードの初期化を行ってください",
    idPlaceholder: "メール or 施工IDを入力してください",
    pwPlaceholder: "パスワードを入力してください",
  },
  general: {
    title: "当社一般会員にご登録のお客様",
    description:
      "※ ご登録時のメールアドレスとパスワードを入力してください",
    idPlaceholder: "メール or 施工IDを入力してください",
    pwPlaceholder: "パスワードを入力してください",
  },
};

interface LoginFormProps {
  activeTab: TabType;
  id: string;
  password: string;
  showPassword: boolean;
  saveId: boolean;
  agreeTerms: boolean;
  error: string | null;
  onIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSaveIdChange: (checked: boolean) => void;
  onAgreeTermsChange: (checked: boolean) => void;
  onClearId: () => void;
  onSubmit: () => void;
}

export function LoginForm({
  activeTab,
  id,
  password,
  showPassword,
  saveId,
  agreeTerms,
  error,
  onIdChange,
  onPasswordChange,
  onTogglePassword,
  onSaveIdChange,
  onAgreeTermsChange,
  onClearId,
  onSubmit,
}: LoginFormProps) {
  const { openPopup } = usePopupStore();
  const config = TAB_CONFIG[activeTab];

  return (
    <div className="flex flex-col gap-6 lg:gap-[30px] w-full">
      {/* 타이틀 영역 */}
      <div className="flex flex-col gap-2 text-[#101010] leading-[1.5]">
        <h2 className="font-['Noto_Sans_JP'] text-[16px] lg:text-[18px] font-semibold">
          {config.title}
        </h2>
        <p className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px]">
          {config.description}
        </p>
      </div>

      {/* 폼 + 옵션 + 로그인 버튼 */}
      <div className="flex flex-col gap-6 w-full">
        {/* 입력 필드 + 옵션 */}
        <div className="flex flex-col gap-5 w-full">
          {/* 입력 필드 */}
          <div className="flex flex-col gap-2 lg:gap-[14px] w-full">
            {/* ID 입력 */}
            <div className="flex items-center h-[56px] px-4 bg-white border border-[#EEF1F4] rounded-[4px] focus-within:border-[#EAD8D3] transition-colors duration-200">
              <div className="flex flex-1 items-center gap-[15px]">
                <Image
                  src="/asset/images/contents/user_icon.svg"
                  alt=""
                  width={10}
                  height={12}
                  className="shrink-0"
                />
                <input
                  type="text"
                  value={id}
                  onChange={(e) => onIdChange(e.target.value)}
                  placeholder={config.idPlaceholder}
                  className="flex-1 min-w-0 font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] text-[#101010] bg-transparent outline-none placeholder:text-[#CBBBB7]"
                />
              </div>
              {id && (
                <button
                  type="button"
                  onClick={onClearId}
                  className="shrink-0 ml-2"
                  tabIndex={-1}
                  aria-label="クリア"
                >
                  <Image
                    src="/asset/images/contents/id_del.svg"
                    alt=""
                    width={18}
                    height={18}
                  />
                </button>
              )}
            </div>

            {/* PW 입력 */}
            <div className="flex items-center h-[56px] px-4 bg-white border border-[#EEF1F4] rounded-[4px] focus-within:border-[#EAD8D3] transition-colors duration-200">
              <div className="flex flex-1 items-center gap-[15px]">
                <Image
                  src="/asset/images/contents/lock_icon.svg"
                  alt=""
                  width={10}
                  height={13}
                  className="shrink-0"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder={config.pwPlaceholder}
                  className="flex-1 min-w-0 font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] text-[#101010] bg-transparent outline-none placeholder:text-[#CBBBB7]"
                />
              </div>
              <button
                type="button"
                onClick={onTogglePassword}
                className="shrink-0 ml-2"
                tabIndex={-1}
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                <Image
                  src={
                    showPassword
                      ? "/asset/images/contents/eye_show.svg"
                      : "/asset/images/contents/eye_hide.svg"
                  }
                  alt=""
                  width={20}
                  height={14}
                />
              </button>
            </div>
          </div>

          {/* 옵션 영역 */}
          <div className="flex flex-col gap-[14px] lg:flex-row lg:gap-5">
            <div className="lg:flex-1">
              <Checkbox
                checked={saveId}
                onChange={onSaveIdChange}
                label="ID Save"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={agreeTerms}
                onChange={onAgreeTermsChange}
              />
              <span className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] text-[#101010] leading-[1.5]">
                利用規約に同意する必要があります
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); openPopup("terms"); }
                  }
                  className="font-['Noto_Sans_JP'] font-semibold text-[#E97923] underline cursor-pointer"
                >
                  (表示)
                </button>
              </span>
            </label>
          </div>
        </div>

        {/* 로그인 버튼 */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onSubmit}
          className="!h-[46px] !text-[14px] lg:!h-[56px] lg:!text-[15px]"
        >
          Login
        </Button>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center justify-center gap-2">
          <Image
            src="/asset/images/contents/warning_icon.svg"
            alt=""
            width={14}
            height={13}
            className="shrink-0"
          />
          <p className="font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] text-[#FF1A1A] leading-[1.5]">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
