"use client";

import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { CodeDetailItem } from "./codes-dummy-data";

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

interface CodesDetailTableProps {
  rows: CodeDetailItem[];
  selectedHeaderCode: string;
  hasNewRow: boolean;
  onAdd: () => void;
  onCancelAdd: () => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesDetailTable({
  rows,
  selectedHeaderCode,
  hasNewRow,
  onAdd,
  onCancelAdd,
  onNewRowFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesDetailTableProps) {
  // --- Cell Renderers ---

  function DisplayCodeRenderer(params: ICellRendererParams<CodeDetailItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.displayCode}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("displayCode", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.displayCode}</span>;
  }

  function CodeNameRenderer(params: ICellRendererParams<CodeDetailItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.codeName}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("codeName", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.codeName}</span>;
  }

  function CodeNameEtcRenderer(params: ICellRendererParams<CodeDetailItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.codeNameEtc}
          placeholder=""
          onChange={(v) => onNewRowFieldChange("codeNameEtc", v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.codeNameEtc}</span>;
  }

  function RelFieldRenderer(params: ICellRendererParams<CodeDetailItem>) {
    const data = params.data;
    if (!data) return null;
    const field = params.colDef?.field as string | undefined;
    if (data.isNew && field) {
      return (
        <CellInput
          defaultValue=""
          placeholder=""
          onChange={(v) => onNewRowFieldChange(field, v)}
        />
      );
    }
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
  }

  function ActiveTextRenderer(params: ICellRendererParams<CodeDetailItem>) {
    const data = params.data;
    if (!data || data.isNew) return null;
    return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
  }

  const columnDefs: ColDef<CodeDetailItem>[] = [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Code", field: "code", flex: 0.8, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Display Code", field: "displayCode", flex: 0.8, cellRenderer: DisplayCodeRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Code Name", field: "codeName", flex: 1.5, cellRenderer: CodeNameRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: () => true },
    { headerName: "Code Name\n(etc.)", field: "codeNameEtc", flex: 1, cellRenderer: CodeNameEtcRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "Sort\nOrder", field: "sortOrder", flex: 0.6, cellRenderer: RelFieldRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: () => true },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRenderer, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ];

  const getRowClass = (params: RowClassParams<CodeDetailItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
            Code Detail
          </h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button variant="outline" onClick={onAdd} disabled={!selectedHeaderCode}>追加</Button>
          )}
        </div>
      </div>
      <DataGrid<CodeDetailItem>
        columnDefs={columnDefs}
        rowData={rows}
        getRowClass={getRowClass}
        className="codes-detail-grid"
        maxHeight={0}
      />
    </div>
  );
}
