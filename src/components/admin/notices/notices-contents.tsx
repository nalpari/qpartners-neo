"use client";

import { useState } from "react";

import { NoticesSearch } from "./notices-search";
import { NoticesTable } from "./notices-table";
import { INITIAL_FILTERS } from "./notices-types";
import type { NoticeSearchFilters } from "./notices-types";

// Design Ref: §4.1 — NoticesContents 상태 관리

export function NoticesContents() {
  const [filters, setFilters] = useState<NoticeSearchFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);

  const handleSearch = (newFilters: NoticeSearchFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <NoticesSearch filters={filters} onSearch={handleSearch} onReset={handleReset} />
      <NoticesTable filters={filters} page={page} onPageChange={setPage} />
    </main>
  );
}
