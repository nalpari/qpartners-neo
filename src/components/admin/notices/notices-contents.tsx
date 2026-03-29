"use client";

import { NoticesSearch } from "./notices-search";
import { NoticesTable } from "./notices-table";

export function NoticesContents() {
  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <NoticesSearch />
      <NoticesTable />
    </main>
  );
}
