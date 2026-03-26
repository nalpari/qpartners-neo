// Design Ref: §3 — 검색바 (Figma 272-590, 비주얼 섹션 내부)
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function HomeSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/contents?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="flex items-center w-full h-[48px] lg:h-[60px] bg-white rounded-[8px] overflow-hidden">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="検索語を入力してください"
        className="flex-1 h-full px-[20px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] placeholder:text-[#aaaaaa] outline-none"
      />
      <button
        type="button"
        onClick={handleSearch}
        className="flex items-center justify-center size-[48px] lg:size-[60px] bg-[#e97923] rounded-r-[8px] shrink-0 cursor-pointer"
      >
        <Image
          src="/asset/images/contents/home_search_icon.svg"
          alt="検索"
          width={19}
          height={19}
        />
      </button>
    </div>
  );
}
