"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { CodesSearch } from "./codes-search";
import { CodesHeaderTable } from "./codes-header-table";
import { CodesDetailTable } from "./codes-detail-table";
import type {
  CodeHeaderResponse,
  CodeDetailResponse,
  HeaderGridRow,
  DetailGridRow,
} from "./codes-types";
import {
  toHeaderGridRow,
  toDetailGridRow,
  DETAIL_NULLABLE_FIELDS,
  EMPTY_HEADER_FIELDS,
  EMPTY_DETAIL_FIELDS,
} from "./codes-types";

// Design Ref: §7 — 에러 핸들링 (단계별 메시지 분기)
function getApiErrorMessage(err: unknown, stage?: string): string {
  const prefix = stage ? `${stage}: ` : "";
  if (!isAxiosError(err)) return `${prefix}サーバーエラーが発生しました。`;
  const status = err.response?.status;
  switch (status) {
    case 400: return `${prefix}入力値を確認してください。`;
    case 401: return "ログインが必要です。";
    case 403: return "権限がありません。";
    case 404: return `${prefix}データが見つかりません。`;
    case 409: return `${prefix}既に存在するコードです。`;
    default: return `${prefix}サーバーエラーが発生しました。`;
  }
}

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
  const [isSaving, setIsSaving] = useState(false);

  // --- 신규행 상태 ---
  const [headerNewRow, setHeaderNewRow] = useState<HeaderGridRow | null>(null);
  const [detailNewRow, setDetailNewRow] = useState<DetailGridRow | null>(null);
  const headerNewRowRef = useRef<Record<string, string>>({ ...EMPTY_HEADER_FIELDS });
  const detailNewRowRef = useRef<Record<string, string>>({ ...EMPTY_DETAIL_FIELDS });
  const detailEditRef = useRef<Record<string, string>>({});

  // Design Ref: §4.1 — Header 목록 (queryKey prefix 분리: H3)
  const { data: headersRaw = [], isLoading: headersLoading, isError: headersError } = useQuery<CodeHeaderResponse[]>({
    queryKey: ["codes", "headers", { keyword: appliedKeyword, activeOnly: headerActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (appliedKeyword) params.set("keyword", appliedKeyword);
      params.set("activeOnly", String(headerActiveOnly));
      const res = await api.get<{ data: CodeHeaderResponse[] }>(`/codes?${params}`);
      return res.data.data;
    },
  });

  // Design Ref: §4.2 — Detail 목록 (queryKey prefix 분리: H3)
  const selectedHeader = headersRaw.find((h) => h.id === selectedHeaderId);
  const selectedHeaderCode = selectedHeader?.headerCode ?? "";

  const { data: detailsRaw = [], isLoading: detailsLoading, isError: detailsError } = useQuery<CodeDetailResponse[]>({
    queryKey: ["codes", "details", selectedHeaderId, { activeOnly: detailActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("activeOnly", String(detailActiveOnly));
      const res = await api.get<{ data: CodeDetailResponse[] }>(
        `/codes/${selectedHeaderId}/details?${params}`,
      );
      return res.data.data;
    },
    enabled: selectedHeaderId !== null && Number.isFinite(selectedHeaderId),
  });

  // --- Grid 표시용 데이터 (H7: spread로 immutable 처리) ---
  const headerRows: HeaderGridRow[] = [
    ...(headerNewRow ? [headerNewRow] : []),
    ...headersRaw.map(toHeaderGridRow),
  ];

  const detailRows: DetailGridRow[] = [
    ...(detailNewRow ? [detailNewRow] : []),
    ...detailsRaw.map((d) => {
      const row = toDetailGridRow(d, selectedHeaderCode);
      if (editingCell && row.id === editingCell.rowId) {
        return { ...row, editingField: editingCell.field };
      }
      return row;
    }),
  ];

  // Design Ref: §4.3 — Header 등록 mutation (queryKey 분리)
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
      queryClient.invalidateQueries({ queryKey: ["codes", "headers"] });
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
      queryClient.invalidateQueries({ queryKey: ["codes", "details", selectedHeaderId] });
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
      queryClient.invalidateQueries({ queryKey: ["codes", "details", selectedHeaderId] });
      setEditingCell(null);
      detailEditRef.current = {};
    },
  });

  // --- 검색 핸들러 ---
  const handleSearch = useCallback(() => setAppliedKeyword(searchKeyword), [searchKeyword]);
  const handleReset = useCallback(() => {
    setSearchKeyword("");
    setAppliedKeyword("");
  }, []);

  // --- Header 핸들러 (C3: NaN 가드) ---
  const handleHeaderAdd = useCallback(() => {
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
  }, [headerNewRow]);

  const handleHeaderCancelAdd = useCallback(() => {
    setHeaderNewRow(null);
    headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
  }, []);

  const handleHeaderClick = useCallback((id: string) => {
    // C3: 신규행 id("new-*") NaN 가드
    if (id.startsWith("new-")) return;
    const numId = Number(id);
    if (!Number.isFinite(numId)) return;
    setSelectedHeaderId(numId);
    setDetailNewRow(null);
    setEditingCell(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
    detailEditRef.current = {};
  }, []);

  // --- Detail 핸들러 ---
  const handleDetailAdd = useCallback(() => {
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
  }, [detailNewRow, selectedHeaderId, selectedHeaderCode]);

  const handleDetailCancelAdd = useCallback(() => {
    setDetailNewRow(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
  }, []);

  const handleCellEditStart = useCallback((rowId: string, field: string) => {
    // C3: 신규행은 편집 모드 불필요
    if (rowId.startsWith("new-")) return;
    detailEditRef.current = {};
    setEditingCell({ rowId, field });
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    detailEditRef.current = {};
  }, []);

  // Design Ref: §4.7 — 통합 저장 (H8: 중복 호출 가드 + 단계별 에러)
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Header 신규행 저장
      if (headerNewRow) {
        const f = headerNewRowRef.current;
        if (!f.headerCode || !f.headerAlias || !f.headerName) {
          openAlert({ type: "alert", message: "Header Code、Header Id、Header Code Nameは必須です。" });
          return;
        }
        await headerCreateMutation.mutateAsync(f);
      }
      // Detail 신규행 저장
      if (detailNewRow) {
        const f = detailNewRowRef.current;
        if (!f.code || !f.displayCode || !f.codeName) {
          openAlert({ type: "alert", message: "Code、Display Code、Code Nameは必須です。" });
          return;
        }
        await detailCreateMutation.mutateAsync(f);
      }
      // Detail 편집행 저장 (C3: NaN 가드)
      if (editingCell && !editingCell.rowId.startsWith("new-")) {
        const edit = detailEditRef.current;
        const field = editingCell.field;
        const data: Record<string, unknown> = {};
        if (edit[field] !== undefined) {
          if (field === "sortOrder") data[field] = Number(edit[field]) || 0;
          else if ((DETAIL_NULLABLE_FIELDS as readonly string[]).includes(field)) data[field] = edit[field] || null;
          else data[field] = edit[field];
        }
        if (Object.keys(data).length > 0) {
          await detailUpdateMutation.mutateAsync({ detailId: Number(editingCell.rowId), data });
        }
      }
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } catch (err: unknown) {
      // C4: PII 로깅 방지 — status만 기록
      const status = isAxiosError(err) ? err.response?.status : undefined;
      console.error("[Codes] 저장 실패: status=", status);
      openAlert({ type: "alert", message: getApiErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, headerNewRow, detailNewRow, editingCell, openAlert, headerCreateMutation, detailCreateMutation, detailUpdateMutation]);

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
        isError={headersError}
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
        isError={detailsError}
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
