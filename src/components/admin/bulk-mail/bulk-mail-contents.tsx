"use client";

// Design Ref: §3.2 — 검색 state 관리 + 하위 컴포넌트 연결

import { useState } from "react";
import { BulkMailSearch } from "./bulk-mail-search";
import { BulkMailTable } from "./bulk-mail-table";
import type { MassMailSearchParams } from "./bulk-mail-types";

export function BulkMailContents() {
  const [searchParams, setSearchParams] = useState<MassMailSearchParams>({});
  // 검색 시 Table 리마운트로 페이지 리셋 (React Compiler 호환 — useEffect+setState 대신 key 방식)
  const [searchKey, setSearchKey] = useState(0);

  const handleSearch = (params: MassMailSearchParams) => {
    setSearchParams(params);
    setSearchKey((prev) => prev + 1);
  };

  const handleReset = () => {
    setSearchParams({});
    setSearchKey((prev) => prev + 1);
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <BulkMailSearch onSearch={handleSearch} onReset={handleReset} />
      <BulkMailTable key={searchKey} searchParams={searchParams} />
    </main>
  );
}
