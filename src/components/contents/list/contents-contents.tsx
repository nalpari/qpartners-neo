"use client";

import { ContentsSearch } from "./contents-search";
import { ContentsTable } from "./contents-table";

export function ContentsContents() {
  // TODO: 실제 권한 체크로 교체
  const isAdmin = true;

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full pb-[10px] lg:pb-[48px]">
      <ContentsSearch isAdmin={isAdmin} />
      <ContentsTable isAdmin={isAdmin} />
    </main>
  );
}
