"use client";

import { MembersSearch } from "./members-search";
import { MembersTable } from "./members-table";

export function MembersContents() {
  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <MembersSearch />
      <MembersTable />
    </main>
  );
}
