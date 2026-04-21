"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { formatDate } from "@/lib/format";
import type { LoginUser } from "@/lib/schemas/auth";

interface HomeNoticeItem {
  id: number;
  startAt?: string;
  content: string;
  url: string | null;
}

interface ActiveNoticesResponse {
  data: HomeNoticeItem[];
}

export function HomeNotices() {
  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });
  const isLoggedIn = user != null;

  const { data: notices = [] } = useQuery<HomeNoticeItem[]>({
    queryKey: ["home-notices", "active"],
    queryFn: async () => {
      const res = await api.get<ActiveNoticesResponse>(
        "/home-notices/active",
      );
      return res.data.data;
    },
    staleTime: 60_000,
    enabled: isLoggedIn,
  });

  if (!isLoggedIn || notices.length === 0) return null;

  return (
    <>
      {/* PC */}
      <div className="hidden lg:flex gap-[18px] w-full">
        {notices.map((notice) => (
          <NoticeCard key={notice.id} notice={notice} />
        ))}
      </div>

      {/* Mobile */}
      <div className="flex lg:hidden flex-col gap-[10px] w-full mt-[10px]">
        {notices.map((notice) => (
          <NoticeCard key={notice.id} notice={notice} />
        ))}
      </div>
    </>
  );
}

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

function NoticeCard({ notice }: { notice: HomeNoticeItem }) {
  const date = notice.startAt ? formatDate(notice.startAt) : null;
  const hasUrl = notice.url != null && notice.url.length > 0 && isSafeUrl(notice.url);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[24px] px-[24px] pb-[32px] overflow-hidden">
      <div className="flex flex-col gap-[16px]">
        {/* Date header */}
        <div className="flex items-center gap-[8px] h-[44px] bg-[#eef3f8] rounded-[8px] pl-[12px] pr-[8px]">
          {date && (
            <span className="flex-1 min-w-0 truncate font-['Pretendard'] font-medium text-[14px] text-[#6a88a9] leading-[1.4]">
              {date}
            </span>
          )}
          {!date && <span className="flex-1" />}
          {hasUrl && (
            <a
              href={notice.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center size-[28px] shrink-0 hover:opacity-70 transition-opacity"
            >
              <Image
                src="/asset/images/contents/notice_link.svg"
                alt="リンク"
                width={28}
                height={28}
              />
            </a>
          )}
        </div>

        {/* Content */}
        <div className="px-[8px]">
          <p className="font-['Noto_Sans_JP'] text-[13px] text-[#6a88a9] leading-[1.7]">
            {notice.content}
          </p>
        </div>
      </div>
    </div>
  );
}
