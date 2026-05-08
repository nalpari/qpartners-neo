"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import type { ColDef, ICellRendererParams, CellClassParams, CellDoubleClickedEvent, CellClickedEvent, GridApi, GridReadyEvent } from "ag-grid-community";
import type { RowClassParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import type { DetailGridRow } from "./codes-types";

// 편집 불가 필드 — headerCode·code(생성 후 불변, 신규행 입력만 허용).
// 使用可否(isActive) 는 native <select> 로 즉시 토글 가능.
const NON_EDITABLE_FIELDS = new Set(["headerCode", "code"]);

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

// 使用可否 셀 전용 스타일 — native <select> 가 셀 폭을 거의 가득 사용하면서
// 우측 화살표 아이콘(svg 24px + right-2=8px) 과 텍스트 사이 최소 여백 확보용 6px.
// 편집 input 의 4px 와 의도적으로 다름(편집 input 은 border 까지 포함, select 는 absolute 화살표).
const ACTIVE_CELL_STYLE = {
  ...centerCellStyle,
  paddingLeft: "6px",
  paddingRight: "6px",
};

/**
 * 편집 중(신규행 / editingField 일치) 셀의 수평 패딩을 축소해 input 이 컬럼 폭을 거의
 * 가득 사용하되 셀 경계와 최소 여백(4px)을 유지하도록 한다. 테마 기본값
 * `cellHorizontalPadding: 18` 은 좁은 컬럼에서 input 을 잘라 보이게 하고, 0 으로 밀면
 * input 이 셀 경계에 다닥다닥 붙어 가독성이 떨어짐 — 4px 타협점.
 */
function makeEditableCellStyle(field: string) {
  return (params: CellClassParams<DetailGridRow>) => {
    const isEditing = params.data?.isNew || params.data?.editingField === field;
    if (isEditing) {
      return { ...centerCellStyle, paddingLeft: "4px", paddingRight: "4px" };
    }
    return centerCellStyle;
  };
}

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
      className="w-full h-[34px] px-3 bg-white border border-[#101010] rounded-[4px] font-['Noto_Sans_JP'] text-[13px] text-[#101010] outline-none placeholder:text-[#AAAAAA]"
    />
  );
}

type DetailGridContext = {
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onActiveChange: (id: string, isActive: boolean) => void;
  isActiveBusy: boolean;
  // RBAC — active select 가 update=false 시 disabled (Header 와 동일).
  isUpdateReadOnly: boolean;
};

// 컴포넌트 바깥 정의 — 매 렌더 함수 identity 안정화로 셀 재마운트 방지
function EditableCellRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  const field = params.colDef?.field;
  if (!data || !field) return null;
  const ctx = params.context as DetailGridContext;
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

// 使用可否(isActive) — native <select> 로 즉시 토글. onChange 시 부모로 전달되어 PUT 호출.
// 신규행(isNew) 에는 표시하지 않음 — 신규 행은 저장 시 BE default(true) 적용.
//
// custom SelectBox 는 absolute positioned dropdown 이라 AG Grid 셀의 overflow:hidden
// 때문에 옵션 목록이 잘려 보이지 않는다. native <select> 는 브라우저가 외부 popup 으로
// 렌더해 클리핑 없이 정상 표시.
//
// 디자인은 권한관리(permissions-table) ActiveRenderer 와 동일 — appearance-none + 우측
// 화살표 아이콘 absolute. 사이트 전반 일관 룩앤필 유지.
function ActiveSelectRendererFn(params: ICellRendererParams<DetailGridRow>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  const ctx = params.context as DetailGridContext;
  return (
    <div
      className="relative w-full"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={data.isActive}
        disabled={ctx.isActiveBusy || ctx.isUpdateReadOnly}
        onChange={(e) => ctx.onActiveChange(data.id, e.target.value === "Y")}
        className="appearance-none w-full h-[38px] leading-[38px] pl-4 pr-10 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none cursor-pointer hover:border-[#D1D1D1] focus:border-[#101010] disabled:bg-[#F5F5F5] disabled:cursor-not-allowed"
      >
        <option value="Y">Y</option>
        <option value="N">N</option>
      </select>
      <Image
        src="/asset/images/common/select_arr.svg"
        alt=""
        width={24}
        height={24}
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
      />
    </div>
  );
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
  /** blur·다른 셀 클릭 시 호출 — 입력값을 pending 으로 commit 하고 편집 종료 */
  onCommitEdit: () => void;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  newRowFieldsRef: React.RefObject<Record<string, string>>;
  activeOnly: boolean;
  onActiveOnlyChange: (checked: boolean) => void;
  onActiveChange: (id: string, isActive: boolean) => void;
  isActiveBusy?: boolean;
  // RBAC 표준 패턴 — 부모(CodesContents) 단일 호출 후 prop 으로 전달 (PR #148 리뷰 학습).
  // 「追加」=create, cell edit/active toggle=update. Detail 행 삭제 UI 없음 (isActive=N 정책).
  canCreate: boolean;
  canUpdate: boolean;
  isPermLoading: boolean;
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
  onCommitEdit,
  onNewRowFieldChange,
  onEditFieldChange,
  newRowFieldsRef,
  activeOnly,
  onActiveOnlyChange,
  onActiveChange,
  isActiveBusy = false,
  canCreate,
  canUpdate,
  isPermLoading,
}: CodesDetailTableProps) {
  const isUpdateReadOnly = isPermLoading || !canUpdate;
  const canAddNew = !isPermLoading && canCreate;
  // AG Grid API ref + editingCell 변화 시 강제 cell refresh
  // (data 객체에 editingField 가 추가/제거 되어도 셀 value 자체는 변하지 않아
  //  AG Grid 가 자동 refresh 하지 않으므로 수동 트리거 필요)
  const apiRef = useRef<GridApi<DetailGridRow> | null>(null);
  const prevEditingRowIdRef = useRef<string | null>(null);
  const handleGridReady = useCallback((event: GridReadyEvent<DetailGridRow>) => {
    apiRef.current = event.api;
  }, []);
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    // 편집 셀 전환 시 이전 행 + 현재 행만 refresh — 전체 그리드 재렌더 회피
    const ids = new Set<string>();
    if (prevEditingRowIdRef.current) ids.add(prevEditingRowIdRef.current);
    if (editingCell?.rowId) ids.add(editingCell.rowId);
    const rowNodes = Array.from(ids)
      .map((id) => api.getRowNode(id))
      .filter((node): node is NonNullable<typeof node> => node != null);
    if (rowNodes.length) api.refreshCells({ rowNodes, force: true });
    prevEditingRowIdRef.current = editingCell?.rowId ?? null;
  }, [editingCell]);

  // 키보드 — Enter: 현재 셀 commit (pending 누적) / Escape: 입력 폐기.
  // 서버 저장은 상단 「保存」 버튼만 트리거. Enter 저장 → 누적 저장 의도와 충돌하므로 분리.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  }, [onCommitEdit, onEditCancel]);

  // ag-grid context로 핸들러 주입
  const gridContext = useMemo<DetailGridContext>(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onEditFieldChange,
    onKeyDown: handleKeyDown,
    onActiveChange,
    isActiveBusy,
    isUpdateReadOnly,
  }), [newRowFieldsRef, onNewRowFieldChange, onEditFieldChange, handleKeyDown, onActiveChange, isActiveBusy, isUpdateReadOnly]);

  const columnDefs = useMemo<ColDef<DetailGridRow>[]>(() => [
    { headerName: "Header Code", field: "headerCode", flex: 1, cellRenderer: HeaderCodeCellRendererFn, cellStyle: centerCellStyle, headerClass: "ag-header-cell-center" },
    { headerName: "Code", field: "code", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("code"), headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Display Code", field: "displayCode", flex: 0.8, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("displayCode"), headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Code Name", field: "codeName", flex: 1.5, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("codeName"), headerClass: "ag-header-cell-center", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Code Name\n(etc.)", field: "codeNameEtc", flex: 1, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("codeNameEtc"), headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode1", field: "relCode1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("relCode1"), headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nCode2", field: "relCode2", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("relCode2"), headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Rel\nNum1", field: "relNum1", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("relNum1"), headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "Sort\nOrder", field: "sortOrder", flex: 0.6, cellRenderer: EditableCellRendererFn, cellStyle: makeEditableCellStyle("sortOrder"), headerClass: "ag-header-cell-center ag-header-cell-wrap", suppressKeyboardEvent: suppressKeyboardWhenEditing },
    { headerName: "使用可否", field: "isActive", flex: 0.8, cellRenderer: ActiveSelectRendererFn, cellStyle: ACTIVE_CELL_STYLE, headerClass: "ag-header-cell-center" },
  ], []);

  const getRowClass = useCallback((params: RowClassParams<DetailGridRow>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  // 편집 중인 셀 외 다른 영역 클릭 → 입력값을 pending 으로 commit 하고 편집 종료.
  // 같은 셀 다시 클릭은 무시. 다른 셀 더블클릭 시는 handleCellDoubleClicked 가 우선
  // 처리 후 onCellEditStart → 부모가 이전 편집을 자동 commit (같은 hook 인스턴스).
  const handleCellClicked = useCallback((event: CellClickedEvent<DetailGridRow>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    onCommitEdit();
  }, [editingCell, onCommitEdit]);

  const handleCellDoubleClicked = useCallback((event: CellDoubleClickedEvent<DetailGridRow>) => {
    const data = event.data;
    const field = event.colDef.field;
    if (!data || data.isNew || !field) return;
    if (NON_EDITABLE_FIELDS.has(field)) return;
    // RBAC — 부모(handleDetailCellEditStart) 가 패턴 E 본체 가드를 적용하지만 여기서도
    // silent return 으로 alert 노출 횟수를 1회로 통일.
    if (isUpdateReadOnly) return;
    // 이전 편집이 있으면 onCellEditStart 내부에서 ref 가 reset 되며 자동 취소됨
    onCellEditStart(data.id, field);
  }, [onCellEditStart, isUpdateReadOnly]);

  return (
    <div className="flex flex-col w-[1440px] gap-[18px] pt-[34px] pb-[42px] px-[42px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">Code Detail</h2>
          <Checkbox checked={activeOnly} onChange={onActiveOnlyChange} label="使用可否がYの値のみ表示" />
        </div>
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={onCancelAdd}>キャンセル</Button>
          ) : (
            <Button
              variant="outline"
              onClick={onAdd}
              disabled={!selectedHeaderCode || !canAddNew}
            >
              追加
            </Button>
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
        maxHeight={350}
        loading={isLoading}
        onCellDoubleClicked={handleCellDoubleClicked}
        onCellClicked={handleCellClicked}
        onGridReady={handleGridReady}
      />
    </div>
  );
}
