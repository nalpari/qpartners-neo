"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import type { ColDef, ICellRendererParams, CellDoubleClickedEvent, CellClickedEvent, GridApi, GridReadyEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { DetailGridRow } from "./codes-types";

// 편집 불가 필드 — 첫번째 컬럼(headerCode) + 使用可否(isActive)
const NON_EDITABLE_FIELDS = new Set(["headerCode", "isActive"]);

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

// AG Grid 의 셀 키보드 네비게이션이 input 타이핑(화살표/Home/End 등)을 가로채지 않도록
// 편집 가능 컬럼에 적용. input/textarea 가 포커스된 상태에서는 모든 키를 input 이 처리.
function suppressKeyboardWhenEditing(params: { event: KeyboardEvent }) {
  const target = params.event.target as HTMLElement | null;
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * 셀 인라인 편집용 input — defaultValue(uncontrolled)로 부모 setState 재렌더 차단,
 * 변경값은 부모 ref(detailEditRef)에 즉시 반영되어 saved 시점에 읽힘.
 * autoFocus + select 로 최초 진입 시 전체 텍스트 선택.
 */
function CellInput({
  defaultValue,
  placeholder,
  onChange,
  onKeyDown,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // 화살표/Home/End 등 커서 이동 키는 AG Grid 셀 네비게이션이 가로채지 않도록 차단
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
          e.stopPropagation();
          return;
        }
        onKeyDown?.(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none placeholder:text-[#AAAAAA]"
    />
  );
}

// 컴포넌트 바깥 정의 — 매 렌더 함수 identity 안정화로 셀 재마운트 방지
function EditableCellRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  const field = params.colDef?.field;
  if (!data || !field) return null;
  const ctx = params.context as {
    newRowFieldsRef: React.RefObject<Record<string, string>>;
    onNewRowFieldChange: (field: string, value: string) => void;
    onEditFieldChange: (field: string, value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  if (data.isNew) {
    return <CellInput defaultValue={ctx.newRowFieldsRef.current[field] ?? ""} placeholder="" onChange={(v) => ctx.onNewRowFieldChange(field, v)} />;
  }
  if (data.editingField === field) {
    return <CellInput defaultValue={String(params.value ?? "")} placeholder="" onChange={(v) => ctx.onEditFieldChange(field, v)} onKeyDown={ctx.onKeyDown} />;
  }
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{String(params.value ?? "")}</span>;
}

function HeaderCodeCellRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  if (!data) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.headerCode}</span>;
}

function ActiveTextRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  return <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">{data.isActive}</span>;
}

interface CodesDetailTableProps {
  rows: DetailGridRow[];
  selectedHeaderCode: string;
  hasNewRow: boolean;
  isLoading?: boolean;
  editingCell: { rowId: string; field: string } | null;
  onAdd: () => void;
  onCancelAdd: () => void;
  onCellEditStart: (rowId: string, field: string) => void;
  onEditCancel: () => void;
  onSave?: () => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
}

export function CodesDetailTable({
  rows,
  selectedHeaderCode,
  hasNewRow,
  isLoading,
  editingCell,
  onAdd,
  onCancelAdd,
  onCellEditStart,
  onEditCancel,
  onSave,
  onNewRowFieldChange,
  onEditFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
}: CodesDetailTableProps) {
  // AG Grid API ref + editingCell 변화 시 강제 cell refresh
  // (data 객체에 editingField 가 추가/제거 되어도 셀 value 자체는 변하지 않아
  //  AG Grid 가 자동 refresh 하지 않으므로 수동 트리거 필요)
  const apiRef = useRef<GridApi<DetailGridRow> | null>(null);
  const handleGridReady = useCallback((event: GridReadyEvent<DetailGridRow>) => {
    apiRef.current = event.api;
  }, []);
  useEffect(() => {
    apiRef.current?.refreshCells({ force: true });
  }, [editingCell]);

  // 키보드 — Enter 저장 / Escape 취소
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  }, [onSave, onEditCancel]);

  // ag-grid context로 핸들러 주입
  const gridContext = useMemo(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onEditFieldChange,
    onKeyDown: handleKeyDown,
  }), [newRowFieldsRef, onNewRowFieldChange, onEditFieldChange, handleKeyDown]);

  const columnDefs = useMemo<ColDef<DetailGridRow>[]>(() => [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code", field: "code", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Display Code", field: "displayCode", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Code Name", field: "codeName", flex: 1.5, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Code Name\n(etc.)", field: "codeNameEtc", flex: 1, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Sort\nOrder", field: "sortOrder", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "使用可否", field: "isActive", flex: 0.6, cellRenderer: ActiveTextRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
  ], []);

  const getRowClass = useCallback((params: RowClassParams<DetailGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  // 편집 중인 셀 외 다른 영역 클릭 → 즉시 취소·복원 (확인 다이얼로그 없음)
  // 같은 셀 다시 클릭은 무시. 다른 셀 더블클릭 시는 handleCellDoubleClicked 가 우선
  // 처리 후 onCellEditStart → 부모가 이전 편집을 자동 정리(같은 hook 인스턴스).
  const handleCellClicked = useCallback((event: CellClickedEvent<DetailGridRow>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    onEditCancel();
  }, [editingCell, onEditCancel]);

  const handleCellDoubleClicked = useCallback((event: CellDoubleClickedEvent<DetailGridRow>) => {
    const data = event.data;
    const field = event.colDef.field;
    if (!data || data.isNew || !field) return;
    if (NON_EDITABLE_FIELDS.has(field)) return;
    // 이전 편집이 있으면 onCellEditStart 내부에서 ref 가 reset 되며 자동 취소됨
    onCellEditStart(data.id, field);
  }, [onCellEditStart]);

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">Code Detail</h2>
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
      <DataGrid<DetailGridRow>
        columnDefs={columnDefs}
        rowData={rows}
        getRowClass={getRowClass}
        getRowId={(p) => p.data.id}
        context={gridContext}
        className="codes-detail-grid"
        maxHeight={500}
        loading={isLoading}
        onCellDoubleClicked={handleCellDoubleClicked}
        onCellClicked={handleCellClicked}
        onGridReady={handleGridReady}
      />
    </div>
  );
}
