"use client";

import Image from "next/image";
import Link from "next/link";
import { usePopupStore } from "@/lib/store";

type TabType = "dealer" | "installer" | "general";

const REGISTRATION_URLS: Record<TabType, string> = {
  dealer: "https://www.hanasys.jp/join",
  installer: "https://q-partners.q-cells.jp/seminar/",
  general: "/signup",
};

interface LoginLinksProps {
  activeTab: TabType;
}

export function LoginLinks({ activeTab }: LoginLinksProps) {
  const registrationUrl = REGISTRATION_URLS[activeTab];
  const isExternal = registrationUrl.startsWith("http");
  const openPopup = usePopupStore((s) => s.openPopup);

  return (
    <>
      {/* PC 레이아웃 — 가로 + 구분선 */}
      <div className="hidden lg:flex items-center justify-center gap-3">
        <ButtonLinkItem
          label="ID紛失お問い合わせ"
          onClick={() => openPopup("id-inquiry", { activeTab })}
        />
        <span className="w-px h-3 bg-[#D9D9D9]" />
        <ButtonLinkItem
          label="パスワードの初期化"
          onClick={() => openPopup("password-reset", { activeTab })}
        />
        <span className="w-px h-3 bg-[#D9D9D9]" />
        <LinkItem
          label="会員登録"
          href={registrationUrl}
          isHighlight
          isExternal={isExternal}
        />
      </div>

      {/* 모바일 레이아웃 — 세로 박스 */}
      <div className="flex lg:hidden flex-col w-full">
        <MobileButtonLinkItem
          label="ID紛失お問い合わせ"
          onClick={() => openPopup("id-inquiry", { activeTab })}
          className="rounded-t-[4px] border border-[#EEE]"
        />
        <MobileButtonLinkItem
          label="パスワードの初期化"
          onClick={() => openPopup("password-reset", { activeTab })}
          className="border-x border-b border-[#EEE]"
        />
        <MobileLinkItem
          label="会員登録"
          href={registrationUrl}
          isHighlight
          isExternal={isExternal}
          className="rounded-b-[4px] border-x border-b border-[#EEE]"
        />
      </div>
    </>
  );
}

function ButtonLinkItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] font-normal cursor-pointer"
    >
      {label}
      <Image src="/asset/images/contents/arrow_right.svg" alt="" width={6} height={10} />
    </button>
  );
}

function MobileButtonLinkItem({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center h-[52px] bg-white cursor-pointer ${className}`}
    >
      <span className="flex items-center justify-center gap-2 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010] font-normal">
        {label}
        <Image src="/asset/images/contents/arrow_right.svg" alt="" width={4} height={8} />
      </span>
    </button>
  );
}

function LinkItem({
  label,
  href,
  isHighlight = false,
  isExternal = false,
}: {
  label: string;
  href: string;
  isHighlight?: boolean;
  isExternal?: boolean;
}) {
  const textClass = isHighlight
    ? "text-[#E97923] font-medium"
    : "text-[#101010] font-normal";
  const arrowSrc = isHighlight
    ? "/asset/images/contents/arrow_right_orange.svg"
    : "/asset/images/contents/arrow_right.svg";

  const content = (
    <span className={`flex items-center gap-2 font-['Noto_Sans_JP'] text-[14px] leading-[1.5] ${textClass}`}>
      {label}
      <Image src={arrowSrc} alt="" width={6} height={10} />
    </span>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return (
    <Link href={href} transitionTypes={["fade"]}>
      {content}
    </Link>
  );
}

function MobileLinkItem({
  label,
  href,
  isHighlight = false,
  isExternal = false,
  className = "",
}: {
  label: string;
  href: string;
  isHighlight?: boolean;
  isExternal?: boolean;
  className?: string;
}) {
  const textClass = isHighlight
    ? "text-[#E97923] font-medium"
    : "text-[#101010] font-normal";
  const arrowSrc = isHighlight
    ? "/asset/images/contents/arrow_right_orange.svg"
    : "/asset/images/contents/arrow_right.svg";

  const content = (
    <span className={`flex items-center justify-center gap-2 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] ${textClass}`}>
      {label}
      <Image src={arrowSrc} alt="" width={4} height={8} />
    </span>
  );

  const boxClass = `flex items-center justify-center h-[52px] bg-white ${className}`;

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={boxClass}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={boxClass} transitionTypes={["fade"]}>
      {content}
    </Link>
  );
}
