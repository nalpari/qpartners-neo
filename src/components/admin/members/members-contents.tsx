"use client";

// Design Ref: §4.1 — 메인 컨테이너 (filters + page + pageSize 상태 관리)

import { useState } from "react";
import { MembersSearch } from "./members-search";
import { MembersTable } from "./members-table";
import type { MemberSearchFilters } from "./members-types";
import { INITIAL_FILTERS } from "./members-types";

export function MembersContents() {
  const [filters, setFilters] = useState<MemberSearchFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const handleSearch = (newFilters: MemberSearchFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <MembersSearch filters={filters} onSearch={handleSearch} onReset={handleReset} />
      <MembersTable
        filters={filters}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </main>
  );
}
