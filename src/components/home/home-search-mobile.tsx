// Design Ref: 모바일 검색바 (Figma 272-1114, 흰색 배경 + 정사각형 오렌지 버튼)
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function HomeSearchMobile() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/contents?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="flex items-center w-full h-[52px] bg-white lg:hidden">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="検索語を入力してください"
        className="flex-1 h-full pl-[20px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] placeholder:text-[#aaaaaa] outline-none"
      />
      <button
        type="button"
        onClick={handleSearch}
        className="flex items-center justify-center aspect-square h-full bg-[#e97923] shrink-0 cursor-pointer"
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
