"use client";

import { useState } from "react";

import { NoticesSearch } from "./notices-search";
import { NoticesTable } from "./notices-table";
import { INITIAL_FILTERS } from "./notices-types";
import type { NoticeSearchFilters } from "./notices-types";
import { usePageSize } from "@/hooks/use-page-size";

// Design Ref: §4.1 — NoticesContents 상태 관리

export function NoticesContents() {
  const [filters, setFilters] = useState<NoticeSearchFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  // 일괄 삭제 선택 상태는 부모가 보유 — page/filter 변경 시 명시적으로 초기화해
  // 사용자 시야 밖 ID 가 누적되어 잘못 삭제되는 사고를 차단.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // PAGE_SIZE 공통코드 기반 표시건수 — 회원관리/콘텐츠 등과 동일 패턴.
  const { pageSize, setPageSize } = usePageSize();

  const handleSearch = (newFilters: NoticeSearchFilters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
    setResetKey((k) => k + 1);
    setSelectedIds(new Set());
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    setSelectedIds(new Set());
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <NoticesSearch key={resetKey} filters={filters} onSearch={handleSearch} onReset={handleReset} />
      <NoticesTable
        filters={filters}
        page={page}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />
    </main>
  );
}
