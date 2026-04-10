"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { CodesSearch } from "./codes-search";
import { CodesHeaderTable } from "./codes-header-table";
import { CodesDetailTable } from "./codes-detail-table";

// Design Ref: §2.1 — API Response Types
interface CodeHeaderRow {
  id: number;
  headerCode: string;
  headerAlias: string;
  headerName: string;
  relCode1: string | null;
  relCode2: string | null;
  relCode3: string | null;
  relNum1: string | null;
  relNum2: string | null;
  relNum3: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CodeDetailRow {
  id: number;
  headerId: number;
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  relCode1: string | null;
  relCode2: string | null;
  relCode3: string | null;
  relNum1: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Design Ref: §2.2 — Grid 표시용 타입
export interface HeaderGridRow {
  id: string;
  headerCode: string;
  headerAlias: string;
  headerName: string;
  relCode1: string;
  relCode2: string;
  relCode3: string;
  relNum1: string;
  relNum2: string;
  relNum3: string;
  isActive: "Y" | "N";
  isNew?: boolean;
}

export interface DetailGridRow {
  id: string;
  headerId: string;
  headerCode: string;
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string;
  relCode1: string;
  relCode2: string;
  relNum1: string;
  sortOrder: number;
  isActive: "Y" | "N";
  isNew?: boolean;
  editingField?: string;
}

// Design Ref: §2.3 — API → Grid 변환
function toHeaderGridRow(row: CodeHeaderRow): HeaderGridRow {
  return {
    id: String(row.id),
    headerCode: row.headerCode,
    headerAlias: row.headerAlias,
    headerName: row.headerName,
    relCode1: row.relCode1 ?? "",
    relCode2: row.relCode2 ?? "",
    relCode3: row.relCode3 ?? "",
    relNum1: row.relNum1 ?? "",
    relNum2: row.relNum2 ?? "",
    relNum3: row.relNum3 ?? "",
    isActive: row.isActive ? "Y" : "N",
  };
}

function toDetailGridRow(row: CodeDetailRow, headerCode: string): DetailGridRow {
  return {
    id: String(row.id),
    headerId: String(row.headerId),
    headerCode,
    code: row.code,
    displayCode: row.displayCode,
    codeName: row.codeName,
    codeNameEtc: row.codeNameEtc ?? "",
    relCode1: row.relCode1 ?? "",
    relCode2: row.relCode2 ?? "",
    relNum1: row.relNum1 ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive ? "Y" : "N",
  };
}

// Design Ref: §7 — 에러 핸들링
function getApiErrorMessage(err: unknown): string {
  if (!isAxiosError(err)) return "サーバーエラーが発生しました。";
  const status = err.response?.status;
  switch (status) {
    case 400: return "入力値を確認してください。";
    case 404: return "データが見つかりません。";
    case 409: return "既に存在するコードです。";
    default: return "サーバーエラーが発生しました。";
  }
}

const EMPTY_HEADER_FIELDS = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
const EMPTY_DETAIL_FIELDS = { code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: "" };

export function CodesContents() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // --- 검색/필터 상태 ---
  const [searchKeyword, setSearchKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [headerActiveOnly, setHeaderActiveOnly] = useState(false);
  const [detailActiveOnly, setDetailActiveOnly] = useState(false);
  const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);

  // --- 신규행 상태 ---
  const [headerNewRow, setHeaderNewRow] = useState<HeaderGridRow | null>(null);
  const [detailNewRow, setDetailNewRow] = useState<DetailGridRow | null>(null);
  const headerNewRowRef = useRef<Record<string, string>>({ ...EMPTY_HEADER_FIELDS });
  const detailNewRowRef = useRef<Record<string, string>>({ ...EMPTY_DETAIL_FIELDS });
  const detailEditRef = useRef<Record<string, string>>({});

  // Design Ref: §4.1 — Header 목록 useQuery
  const { data: headersRaw = [], isLoading: headersLoading } = useQuery<CodeHeaderRow[]>({
    queryKey: ["codes", { keyword: appliedKeyword, activeOnly: headerActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (appliedKeyword) params.set("keyword", appliedKeyword);
      params.set("activeOnly", String(headerActiveOnly));
      const res = await api.get<{ data: CodeHeaderRow[] }>(`/codes?${params}`);
      return res.data.data;
    },
  });

  // Design Ref: §4.2 — Detail 목록 useQuery
  const selectedHeader = headersRaw.find((h) => h.id === selectedHeaderId);
  const selectedHeaderCode = selectedHeader?.headerCode ?? "";

  const { data: detailsRaw = [], isLoading: detailsLoading } = useQuery<CodeDetailRow[]>({
    queryKey: ["codes", selectedHeaderId, "details", { activeOnly: detailActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("activeOnly", String(detailActiveOnly));
      const res = await api.get<{ data: CodeDetailRow[] }>(
        `/codes/${selectedHeaderId}/details?${params}`,
      );
      return res.data.data;
    },
    enabled: selectedHeaderId !== null,
  });

  // --- Grid 표시용 데이터 ---
  const headerRows: HeaderGridRow[] = [
    ...(headerNewRow ? [headerNewRow] : []),
    ...headersRaw.map(toHeaderGridRow),
  ];

  const detailRows: DetailGridRow[] = [
    ...(detailNewRow ? [detailNewRow] : []),
    ...detailsRaw.map((d) => {
      const row = toDetailGridRow(d, selectedHeaderCode);
      if (editingCell && row.id === editingCell.rowId) row.editingField = editingCell.field;
      return row;
    }),
  ];

  // Design Ref: §4.3 — Header 등록 mutation
  const headerCreateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const body = {
        headerCode: data.headerCode,
        headerAlias: data.headerAlias,
        headerName: data.headerName,
        relCode1: data.relCode1 || null,
        relCode2: data.relCode2 || null,
        relCode3: data.relCode3 || null,
        relNum1: data.relNum1 || null,
        relNum2: data.relNum2 || null,
        relNum3: data.relNum3 || null,
        isActive: true,
      };
      return api.post("/codes", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes"] });
      setHeaderNewRow(null);
      headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
    },
  });

  // Design Ref: §4.5 — Detail 등록 mutation
  const detailCreateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const body = {
        code: data.code,
        displayCode: data.displayCode,
        codeName: data.codeName,
        codeNameEtc: data.codeNameEtc || null,
        relCode1: data.relCode1 || null,
        relCode2: data.relCode2 || null,
        relNum1: data.relNum1 || null,
        sortOrder: data.sortOrder ? Number(data.sortOrder) : 0,
        isActive: true,
      };
      return api.post(`/codes/${selectedHeaderId}/details`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes", selectedHeaderId, "details"] });
      setDetailNewRow(null);
      detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
    },
  });

  // Design Ref: §4.6 — Detail 수정 mutation
  const detailUpdateMutation = useMutation({
    mutationFn: async ({ detailId, data }: { detailId: number; data: Record<string, unknown> }) => {
      return api.put(`/codes/${selectedHeaderId}/details/${detailId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes", selectedHeaderId, "details"] });
      setEditingCell(null);
      detailEditRef.current = {};
    },
  });

  // --- 검색 핸들러 ---
  const handleSearch = () => setAppliedKeyword(searchKeyword);
  const handleReset = () => {
    setSearchKeyword("");
    setAppliedKeyword("");
  };

  // --- Header 핸들러 ---
  const handleHeaderAdd = () => {
    if (headerNewRow) return;
    headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
    setHeaderNewRow({
      id: `new-${Date.now()}`,
      headerCode: "",
      headerAlias: "",
      headerName: "",
      relCode1: "",
      relCode2: "",
      relCode3: "",
      relNum1: "",
      relNum2: "",
      relNum3: "",
      isActive: "Y",
      isNew: true,
    });
  };

  const handleHeaderCancelAdd = () => {
    setHeaderNewRow(null);
    headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
  };

  const handleHeaderClick = (id: string) => {
    setSelectedHeaderId(Number(id));
    setDetailNewRow(null);
    setEditingCell(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
    detailEditRef.current = {};
  };

  // --- Detail 핸들러 ---
  const handleDetailAdd = () => {
    if (detailNewRow || !selectedHeaderId) return;
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
    setDetailNewRow({
      id: `new-${Date.now()}`,
      headerId: String(selectedHeaderId),
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
    });
  };

  const handleDetailCancelAdd = () => {
    setDetailNewRow(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
  };

  const handleCellEditStart = (rowId: string, field: string) => {
    detailEditRef.current = {};
    setEditingCell({ rowId, field });
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    detailEditRef.current = {};
  };

  // Design Ref: §4.7 — 통합 저장
  const handleSave = async () => {
    try {
      // Header 신규행 필수 필드 검증
      if (headerNewRow) {
        const f = headerNewRowRef.current;
        if (!f.headerCode || !f.headerAlias || !f.headerName) {
          openAlert({ type: "alert", message: "Header Code、Header Id、Header Code Nameは必須です。" });
          return;
        }
        await headerCreateMutation.mutateAsync(f);
      }
      // Detail 신규행 필수 필드 검증
      if (detailNewRow) {
        const f = detailNewRowRef.current;
        if (!f.code || !f.displayCode || !f.codeName) {
          openAlert({ type: "alert", message: "Code、Display Code、Code Nameは必須です。" });
          return;
        }
        await detailCreateMutation.mutateAsync(f);
      }
      // Detail 편집행 저장
      if (editingCell) {
        const edit = detailEditRef.current;
        const field = editingCell.field;
        const data: Record<string, unknown> = {};
        if (edit[field] !== undefined) {
          if (field === "sortOrder") data[field] = Number(edit[field]) || 0;
          else if (["relCode1", "relCode2", "relNum1", "codeNameEtc"].includes(field)) data[field] = edit[field] || null;
          else data[field] = edit[field];
        }
        if (Object.keys(data).length > 0) {
          await detailUpdateMutation.mutateAsync({ detailId: Number(editingCell.rowId), data });
        }
      }
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } catch (err: unknown) {
      console.error("[Codes] 저장 실패:", err);
      openAlert({ type: "alert", message: getApiErrorMessage(err) });
    }
  };

  const isSaving = headerCreateMutation.isPending || detailCreateMutation.isPending || detailUpdateMutation.isPending;

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <CodesSearch
        keyword={searchKeyword}
        onKeywordChange={setSearchKeyword}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      <CodesHeaderTable
        rows={headerRows}
        hasNewRow={!!headerNewRow}
        isLoading={headersLoading}
        onAdd={handleHeaderAdd}
        onCancelAdd={handleHeaderCancelAdd}
        onSave={handleSave}
        isSaving={isSaving}
        onHeaderClick={handleHeaderClick}
        onNewRowFieldChange={(field, value) => { headerNewRowRef.current[field] = value; }}
        newRowFieldsRef={headerNewRowRef}
        activeOnly={headerActiveOnly}
        onActiveOnlyChange={setHeaderActiveOnly}
      />

      <CodesDetailTable
        rows={detailRows}
        selectedHeaderCode={selectedHeaderCode}
        hasNewRow={!!detailNewRow}
        isLoading={detailsLoading}
        editingCell={editingCell}
        onAdd={handleDetailAdd}
        onCancelAdd={handleDetailCancelAdd}
        onCellEditStart={handleCellEditStart}
        onEditCancel={handleEditCancel}
        onNewRowFieldChange={(field, value) => { detailNewRowRef.current[field] = value; }}
        onEditFieldChange={(field, value) => { detailEditRef.current[field] = value; }}
        newRowFieldsRef={detailNewRowRef}
        activeOnly={detailActiveOnly}
        onActiveOnlyChange={setDetailActiveOnly}
      />
    </main>
  );
}
