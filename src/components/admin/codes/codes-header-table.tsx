"use client";

import { useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { CodeHeaderItem } from "./codes-dummy-data";

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

interface CodesHeaderTableProps {
  rows: CodeHeaderItem[];
  hasNewRow: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onSave: () => void;
  onHeaderClick: (id: string) => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesHeaderTable({
  rows,
  hasNewRow,
  onAdd,
  onCancelAdd,
  onSave,
  onHeaderClick,
  onNewRowFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesHeaderTableProps) {
  // --- Cell Renderers ---

  function HeaderCodeRenderer(params: ICellRendererParams<CodeHeaderItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.headerCode}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("headerCode", v)}
        />
      );
    }
    return (
      <button
        type="button"
        className="text-[#1060B4] hover:underline cursor-pointer font-['Noto_Sans_JP'] text-[14px]"
        onClick={() => onHeaderClick(data.id)}
      >
        {data.headerCode}
      </button>
    );
  }

  function AliasRenderer(params: ICellRendererParams<CodeHeaderItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.headerAlias}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("headerAlias", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerAlias}</span>;
  }

  function NameRenderer(params: ICellRendererParams<CodeHeaderItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.headerName}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("headerName", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerName}</span>;
  }

  function RelFieldRenderer(params: ICellRendererParams<CodeHeaderItem>) {
    const data = params.data;
    if (!data) return null;
    const field = params.colDef?.field as keyof CodeHeaderItem | undefined;
    if (data.isNew && field) {
      return (
        <CellInput
          defaultValue=""
          placeholder=""
          onChange={(v) => onNewRowFieldChange(field as "relCode1", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
  }

  function ActiveTextRenderer(params: ICellRendererParams<CodeHeaderItem>) {
    const data = params.data;
    if (!data || data.isNew) return null;
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
  }

  const columnDefs = useMemo<ColDef<CodeHeaderItem>[]>(
    () => [
      { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
      { headerName: "Header Id", field: "headerAlias", flex: 1, cellRenderer: AliasRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
      { headerName: "Header Code Name", field: "headerName", flex: 1.5, cellRenderer: NameRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nCode3", field: "relCode3", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nNum2", field: "relNum2", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "Rel\nNum3", field: "relNum3", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
      { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const getRowClass = (params: RowClassParams<CodeHeaderItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
            Header Code
          </h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button variant="outline" onClick={onAdd}>追加</Button>
          )}
          <Button variant="primary" onClick={onSave}>保存</Button>
        </div>
      </div>
      <DataGrid<CodeHeaderItem>
        columnDefs={columnDefs}
        rowData={rows}
        getRowClass={getRowClass}
        className="codes-header-grid"
        maxHeight={0}
      />
    </div>
  );
}
