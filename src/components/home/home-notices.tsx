"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import type { LoginUser } from "@/lib/schemas/auth";
import { useAuthFlag } from "@/hooks/use-auth-flag";

interface HomeNoticeItem {
  id: number;
  startAt?: string;
  title: string;
  content: string;
  url: string | null;
}

interface ActiveNoticesResponse {
  data: HomeNoticeItem[];
}

// 2026-04-28: title 필드 도입 — 빈 값(이전 데이터 미입력) 안전 폴백으로 유지.
const PLACEHOLDER_TITLE = "タイトル";

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

export function HomeNotices() {
  // 로그인 여부 — AUTH_FLAG_KEY synchronous 플래그로 첫 렌더부터 확정.
  // user 캐시 의존(이전 패턴) 은 Gnb fetch 완료 전 false 로 잠깐 떨어지며 mount 플리커 유발.
  const isLoggedIn = useAuthFlag();
  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  const cacheScope = user ? `${user.userTp}:${user.authRole ?? "-"}` : "guest";
  const { data: notices = [] } = useQuery<HomeNoticeItem[]>({
    queryKey: ["home-notices", "active", cacheScope],
    queryFn: async () => {
      const res = await api.get<ActiveNoticesResponse>(
        "/home-notices/active",
      );
      return res.data.data;
    },
    staleTime: 60_000,
    // 로그인 사용자는 user 가 캐시에 채워질 때까지 대기 → "guest" scope 로의 불필요한 1차 fetch 차단.
    // 비로그인은 isLoggedIn=false 라 이 분기 자체가 false → 어차피 enabled=false.
    enabled: isLoggedIn && user != null,
  });

  // "init": 사용자 미조작 (첫 항목 자동 펼침), number: 해당 id 펼침, null: 모두 접힘
  const [expandedId, setExpandedId] = useState<number | null | "init">("init");

  const firstId = notices[0]?.id ?? null;
  const effectiveId = expandedId === "init" ? firstId : expandedId;

  const toggle = (id: number) => {
    setExpandedId(effectiveId === id ? null : id);
  };

  if (!isLoggedIn || notices.length === 0) return null;

  const lastIdx = notices.length - 1;

  return (
    <div className="flex flex-col w-full gap-[10px] lg:gap-0 lg:bg-white lg:rounded-[12px] lg:shadow-[0px_6px_16px_0px_rgba(0,0,0,0.05)] lg:overflow-hidden">
      {/* Title — Figma 491:366 (PC) / 491:1181 (MO).
          PC: pl/pr 42px py-18px / MO: px-24px pt-16px pb-8px.
          아이콘은 home_notice_icon.svg 자체에 원형 배경 포함 → 40×40 그대로 사용.
          텍스트: お知らせ (Pretendard Bold, PC 18px / MO 16px, #2e5884)
          MO 는 home-contents 의 最近コンテンツ 헤더와 동일하게 페이지 배경 위 (bg 없음, border 없음). */}
      <div className="flex items-center gap-[12px] px-[24px] pt-[16px] pb-[8px] lg:px-[42px] lg:py-[18px] lg:border-b lg:border-[#f3f7fb]">
        <Image
          src="/asset/images/contents/home_notice_icon.svg"
          alt=""
          width={40}
          height={40}
          className="shrink-0"
          aria-hidden="true"
        />
        <p className="flex-1 min-w-0 font-['Pretendard'] font-bold text-[16px] lg:text-[18px] leading-[1.4] text-[#2e5884]">
          お知らせ
        </p>
      </div>

      {/* 행 wrapper — 외부 gap-[10px] 은 헤더와 row 묶음 사이에만 적용되고,
          row 끼리는 흰 박스가 연속해서 붙어 보이도록 내부 gap 0. */}
      <div className="flex flex-col">
        {notices.map((notice, idx) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            isOpen={effectiveId === notice.id}
            isLast={idx === lastIdx}
            onToggle={() => toggle(notice.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NoticeRow({
  notice,
  isOpen,
  isLast,
  onToggle,
}: {
  notice: HomeNoticeItem;
  isOpen: boolean;
  isLast: boolean;
  onToggle: () => void;
}) {
  const date = notice.startAt ? formatDate(notice.startAt) : "";
  const hasUrl = notice.url != null && notice.url.length > 0 && isSafeUrl(notice.url);
  const borderCls = !isLast ? "border-b border-[#f3f7fb]" : "";

  return (
    <div className={`bg-white ${borderCls}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex items-center w-full gap-[8px] pl-[24px] pr-[24px] lg:pl-[42px] lg:pr-[42px] transition-colors duration-200 ${
          isOpen
            ? "h-[48px] bg-[#eef3f8]"
            : "py-[10px] bg-white hover:bg-[#fafbfc]"
        }`}
      >
        <span className="flex-1 min-w-0 flex items-center gap-[16px] overflow-hidden text-[#6a88a9] text-[14px] leading-[1.4] text-left">
          {date && (
            <span className="font-['Pretendard'] font-normal whitespace-nowrap shrink-0">
              {date}
            </span>
          )}
          <span className="font-['Pretendard'] font-semibold truncate">
            {notice.title?.trim() || PLACEHOLDER_TITLE}
          </span>
        </span>
        <span className="shrink-0 size-[28px] flex items-center justify-center text-[#6a88a9]">
          <ChevronIcon open={isOpen} />
        </span>
      </button>

      {/* grid-template-rows 0fr ↔ 1fr 트릭으로 콘텐츠 높이를 모르는 채로 자연스럽게 펼침/접힘 */}
      <div
        aria-hidden={!isOpen}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-[16px] pb-[24px] flex flex-col lg:flex-row items-stretch lg:items-center gap-[14px] lg:gap-[8px] px-[24px] lg:px-[42px]">
            <p className="flex-1 min-w-0 font-['Noto_Sans_JP'] text-[13px] text-[#6a88a9] leading-[1.7] whitespace-pre-wrap break-words">
              {notice.content}
            </p>
            {hasUrl && (
              <a
                href={notice.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={isOpen ? 0 : -1}
                className="flex items-center justify-center gap-[8px] h-[32px] px-[13px] rounded-[4px] border border-[#d2dbe5] bg-white text-[#6a88a9] text-[13px] leading-[1.3] hover:bg-[#f7f9fb] transition-colors w-full lg:w-auto shrink-0"
              >
                <span className="font-['Noto_Sans_JP'] uppercase whitespace-nowrap">リンク</span>
                <Image
                  src="/asset/images/contents/link_icon.svg"
                  alt=""
                  width={12}
                  height={12}
                  className="shrink-0"
                  aria-hidden="true"
                />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M3 5l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

