"use client";

import { useMemo, useCallback } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { HeaderGridRow } from "./codes-types";

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function CellInput({
  defaultValue,
  placeholder,
  onChange,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
    />
  );
}

// ag-grid context 타입 — 파일 스코프 렌더러가 params.context로 참조
type HeaderGridContext = {
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  onNewRowFieldChange: (field: string, value: string) => void;
  onHeaderClick: (id: string) => void;
};

// cell renderer는 파일 스코프 함수로 선언 — 매 렌더 identity가 안정되어 ag-grid 셀 재마운트 방지
function HeaderCodeRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.headerCode ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange("headerCode", v)}
      />
    );
  }
  return (
    <button
      type="button"
      className="text-[#1060B4] hover:underline cursor-pointer font-['Noto_Sans_JP'] text-[14px]"
      onClick={() => ctx.onHeaderClick(data.id)}
    >
      {data.headerCode}
    </button>
  );
}

function AliasRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.headerAlias ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange("headerAlias", v)}
      />
    );
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerAlias}</span>;
}

function NameRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.headerName ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange("headerName", v)}
      />
    );
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerName}</span>;
}

function RelFieldRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data) return null;
  const field = params.colDef?.field as keyof HeaderGridRow | undefined;
  const ctx = params.context as HeaderGridContext;
  if (data.isNew && field) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current[field] ?? ""}
        placeholder=""
        onChange={(v) => ctx.onNewRowFieldChange(field, v)}
      />
    );
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
}

function ActiveTextRendererFn(params: ICellRendererParams<HeaderGridRow>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
}

interface CodesHeaderTableProps {
  rows: HeaderGridRow[];
  hasNewRow: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onSave: () => void;
  isSaving?: boolean;
  onHeaderClick: (id: string) => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesHeaderTable({
  rows,
  hasNewRow,
  isLoading,
  isError,
  onAdd,
  onCancelAdd,
  onSave,
  isSaving,
  onHeaderClick,
  onNewRowFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesHeaderTableProps) {
  // ag-grid context로 핸들러 주입 — 파일 스코프 렌더러가 params.context로 접근
  const gridContext = useMemo<HeaderGridContext>(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onHeaderClick,
  }), [newRowFieldsRef, onNewRowFieldChange, onHeaderClick]);

  // 키보드 편집 접근성 유지 — suppressKeyboardEvent 사용 금지 (WCAG 2.1.1 Keyboard)
  const columnDefs = useMemo<ColDef<HeaderGridRow>[]>(() => [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Header Id", field: "headerAlias", flex: 1, cellRenderer: AliasRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Header Code Name", field: "headerName", flex: 1.5, cellRenderer: NameRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nCode3", field: "relCode3", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nNum2", field: "relNum2", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "Rel\nNum3", field: "relNum3", flex: 0.6, cellRenderer: RelFieldRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap" },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ], []);

  const getRowClass = useCallback((params: RowClassParams<HeaderGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">Header Code</h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button variant="outline" onClick={onAdd}>追加</Button>
          )}
          <Button variant="primary" onClick={onSave} disabled={isSaving}>保存</Button>
        </div>
      </div>
      {isError ? (
        <div className="flex items-center justify-center h-[57px] font-['Noto_Sans_JP'] text-[14px] text-[#E97923]">
          データの読み込みに失敗しました。
        </div>
      ) : (
        <DataGrid<HeaderGridRow>
          columnDefs={columnDefs}
          rowData={rows}
          getRowClass={getRowClass}
          getRowId={(p) => p.data.id}
          context={gridContext}
          className="codes-header-grid"
          maxHeight={0}
          loading={isLoading}
          emptyMessage="値がありません"
        />
      )}
    </div>
  );
}
