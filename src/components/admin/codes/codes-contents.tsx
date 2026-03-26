"use client";

import { useState, useRef } from "react";
import { useAlertStore } from "@/lib/store";
import { CodesSearch } from "./codes-search";
import { CodesHeaderTable } from "./codes-header-table";
import { CodesDetailTable } from "./codes-detail-table";
import { DUMMY_HEADERS, DUMMY_DETAILS } from "./codes-dummy-data";
import type { CodeHeaderItem, CodeDetailItem } from "./codes-dummy-data";

export function CodesContents() {
  const { openAlert } = useAlertStore();

  // --- State ---
  const [headers, setHeaders] = useState<CodeHeaderItem[]>(DUMMY_HEADERS);
  const [details, setDetails] = useState<CodeDetailItem[]>(DUMMY_DETAILS);
  const [selectedHeaderId, setSelectedHeaderId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [headerActiveOnly, setHeaderActiveOnly] = useState(false);
  const [detailActiveOnly, setDetailActiveOnly] = useState(false);

  // --- Header 신규행 ref ---
  const headerNewRowRef = useRef<Record<string, string>>({ headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" });
  const hasNewHeader = headers.some((h) => h.isNew);

  // --- Detail 신규행 ref ---
  const detailNewRowRef = useRef<Record<string, string>>({ code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "" });
  const hasNewDetail = details.some((d) => d.isNew);

  // --- 파생 데이터 ---
  const selectedHeader = headers.find((h) => h.id === selectedHeaderId);
  const selectedHeaderCode = selectedHeader?.headerCode ?? "";

  const filteredHeaders = headers.filter((h) => {
    if (appliedKeyword && !h.headerCode.toLowerCase().includes(appliedKeyword.toLowerCase())) return false;
    if (headerActiveOnly && h.isActive !== "Y") return false;
    return true;
  });

  const filteredDetails = details.filter((d) => {
    if (d.headerId !== selectedHeaderId) return false;
    if (detailActiveOnly && d.isActive !== "Y" && !d.isNew) return false;
    return true;
  });

  // --- 검색 핸들러 ---
  const handleSearch = () => setAppliedKeyword(searchKeyword);
  const handleReset = () => {
    setSearchKeyword("");
    setAppliedKeyword("");
  };

  // --- Header 핸들러 ---
  const handleHeaderAdd = () => {
    if (hasNewHeader) return;
    headerNewRowRef.current = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
    const newRow: CodeHeaderItem = {
      id: `new-${Date.now()}`,
      headerCode: "",
      headerAlias: "",
      headerName: "",
      relCode1: "",
      relCode2: "",
      relCode3: "",
      isActive: "Y",
      isNew: true,
      isSaved: false,
    };
    setHeaders([newRow, ...headers]);
  };

  const handleHeaderCancelAdd = () => {
    setHeaders((prev) => prev.filter((h) => !h.isNew));
    headerNewRowRef.current = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
  };

  const handleHeaderSave = () => {
    const fields = headerNewRowRef.current;
    setHeaders((prev) =>
      prev.map((h) =>
        h.isNew ? { ...h, ...fields, isNew: false, isSaved: true } : h
      )
    );
    headerNewRowRef.current = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
    openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
  };

  const handleHeaderClick = (id: string) => {
    setSelectedHeaderId(id);
    // Detail 신규행이 있으면 제거
    setDetails((prev) => prev.filter((d) => !d.isNew));
    detailNewRowRef.current = { headerCode: "", code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: "" };
  };

  // --- Detail 핸들러 ---
  const handleDetailAdd = () => {
    if (hasNewDetail || !selectedHeaderId) return;
    detailNewRowRef.current = { headerCode: "", code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: "" };
    const newRow: CodeDetailItem = {
      id: `new-${Date.now()}`,
      headerId: selectedHeaderId,
      headerCode: selectedHeaderCode,
      code: "",
      displayCode: "",
      codeName: "",
      codeNameEtc: "",
      relCode1: "",
      relCode2: "",
      relNum1: "",
      sortOrder: 0,
      isActive: "Y",
      isNew: true,
      isSaved: false,
    };
    setDetails([...details.filter((d) => d.headerId !== selectedHeaderId), newRow, ...details.filter((d) => d.headerId === selectedHeaderId)]);
  };

  const handleDetailCancelAdd = () => {
    setDetails((prev) => prev.filter((d) => !d.isNew));
    detailNewRowRef.current = { headerCode: "", code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: "" };
  };


  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 검색 필터 */}
      <CodesSearch
        keyword={searchKeyword}
        onKeywordChange={setSearchKeyword}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* Header Code 테이블 */}
      <CodesHeaderTable
        rows={filteredHeaders}
        hasNewRow={hasNewHeader}
        onAdd={handleHeaderAdd}
        onCancelAdd={handleHeaderCancelAdd}
        onSave={handleHeaderSave}
        onHeaderClick={handleHeaderClick}
        onNewRowFieldChange={(field, value) => { headerNewRowRef.current[field] = value; }}
        newRowFieldsRef={headerNewRowRef}
        activeOnly={headerActiveOnly}
        onActiveOnlyChange={setHeaderActiveOnly}
      />

      {/* Code Detail 테이블 */}
      <CodesDetailTable
        rows={filteredDetails}
        selectedHeaderCode={selectedHeaderCode}
        hasNewRow={hasNewDetail}
        onAdd={handleDetailAdd}
        onCancelAdd={handleDetailCancelAdd}
        onNewRowFieldChange={(field, value) => { detailNewRowRef.current[field] = value; }}
        newRowFieldsRef={detailNewRowRef}
        activeOnly={detailActiveOnly}
        onActiveOnlyChange={setDetailActiveOnly}
      />
    </main>
  );
}
