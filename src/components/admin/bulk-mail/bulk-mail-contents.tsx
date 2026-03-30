"use client";

import { BulkMailSearch } from "./bulk-mail-search";
import { BulkMailTable } from "./bulk-mail-table";

export function BulkMailContents() {
  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <BulkMailSearch />
      <BulkMailTable />
    </main>
  );
}
