"use client";

// Design Ref: codes-header-table 인라인 편집 패턴 그대로 적용
//   - 더블클릭 → 셀이 input 으로 전환
//   - 다른 영역 클릭 → 편집 취소·원복
//   - 다른 셀 더블클릭 → 이전 편집 취소 + 새 셀 편집 시작
//   - 상단 保存 → 현재 편집 중인 셀 단건 저장
//   - input 입력 시 focus 유지 (uncontrolled defaultValue + ref)

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type {
  ColDef,
  ICellRendererParams,
  RowClassParams,
  CellClassParams,
  CellDoubleClickedEvent,
  CellClickedEvent,
  GridApi,
  GridReadyEvent,
} from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import { useAlertStore, usePopupStore } from "@/lib/store";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import type { RoleApiItem, RolesResponse, PermissionItem } from "./permissions-types";
import { toPermissionItem, toCreateRoleBody, toUpdateRoleBody } from "./permissions-types";

// 편집 불가 필드 — roleCode(첫번째 컬럼) + isActive(별도 select 흐름) + Available Menu Setting
const NON_EDITABLE_FIELDS = new Set(["roleCode", "isActive"]);

const centerCellStyle = CENTER_CELL_STYLE;

/**
 * 편집 중(신규행 / editingField 일치) 셀의 수평 패딩을 축소해 input 이 컬럼 폭을 거의
 * 가득 사용하되 셀 경계와 최소 여백(4px)을 유지하도록 한다. 테마 기본값
 * `cellHorizontalPadding: 18` 은 좁은 컬럼에서 input 을 잘라 보이게 하고, 0 으로 밀면
 * input 이 셀 경계에 다닥다닥 붙어 가독성이 떨어짐 — 4px 타협점.
 */
function makeEditableCellStyle(field: string) {
  return (params: CellClassParams<PermissionItem>) => {
    const isEditing = params.data?.isNew || params.data?.editingField === field;
    if (isEditing) {
      return { ...centerCellStyle, paddingLeft: "4px", paddingRight: "4px" };
    }
    return centerCellStyle;
  };
}

// AG Grid row 매칭 안정화 — id 기반 매칭으로 activeOnly 토글/refetch 시 row identity 유지
const getRowIdFn = (p: { data: PermissionItem }) => p.data.id;

// AG Grid 셀 키보드 네비게이션이 input 타이핑(화살표/Home/End 등)을 가로채지 않도록
// 편집 가능 컬럼에 적용. input/textarea focus 시에는 모든 키를 input 이 처리.
function suppressKeyboardWhenEditing(params: { event: KeyboardEvent }) {
  const target = params.event.target as HTMLElement | null;
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * 셀 인라인 편집용 input — defaultValue(uncontrolled) + ref 기반 변경 추적으로
 * 부모 setState 재렌더 차단(focus 유지). autoFocus + select 로 진입 시 전체 선택.
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

// --- AG Grid Context 타입 ---
interface PermissionGridContext {
  [key: string]: unknown;
  newRowFieldsRef: React.RefObject<{ code: string; name: string; description: string }>;
  onNewRowFieldChange: (field: string, value: string) => void;
  onEditFieldChange: (field: string, value: string) => void;
  onActiveChange: (item: PermissionItem, value: "Y" | "N") => void;
}

// --- Cell Renderers (파일 스코프 — AG Grid 리렌더링 최적화) ---

// 첫번째 컬럼 — 신규: input, 기존: 텍스트 (편집 불가)
function CodeRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data) return null;
  if (data.isNew) {
    const ctx = params.context as PermissionGridContext;
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.code ?? ""}
        placeholder="コード入力"
        onChange={(v) => ctx.onNewRowFieldChange("code", v)}
      />
    );
  }
  return (
    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
      {data.roleCode}
    </span>
  );
}

// 일반 편집 가능 컬럼 — 신규: input(newRowRef), 편집중: input(editValuesRef), 그외: 텍스트
function EditableTextRendererFn(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  const field = params.colDef?.field;
  if (!data || !field) return null;
  const ctx = params.context as PermissionGridContext;
  if (data.isNew) {
    // 신규행 필드 키 매핑: roleName → name, description → description
    const refKey = field === "roleName" ? "name" : field === "description" ? "description" : null;
    if (!refKey) return null;
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current[refKey] ?? ""}
        placeholder={refKey === "name" ? "権限名入力" : "説明入力"}
        onChange={(v) => ctx.onNewRowFieldChange(refKey, v)}
      />
    );
  }
  if (data.editingField === field) {
    return (
      <CellInput
        defaultValue={String(params.value ?? "")}
        placeholder=""
        onChange={(v) => ctx.onEditFieldChange(field, v)}
      />
    );
  }
  return (
    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
      {String(params.value ?? "") || "\u00A0"}
    </span>
  );
}

// 신규: 미표시 / 기존: select Y/N (즉시 commit, 별도 흐름)
function ActiveRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  const ctx = params.context as PermissionGridContext;
  return (
    <div
      className="relative w-[100px]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={data.isActive}
        onChange={(e) => ctx.onActiveChange(data, e.target.value as "Y" | "N")}
        className="appearance-none w-full h-[38px] leading-[38px] pl-4 pr-10 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none cursor-pointer hover:border-[#D1D1D1] focus:border-[#101010]"
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

// 신규: 미표시 / 기존: Menu 버튼
function MenuRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  const openPopup = usePopupStore.getState().openPopup;
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant="outline"
        onClick={() => openPopup("permission-menu", { roleCode: data.roleCode, roleName: data.roleName })}
        className="!h-[38px] !min-w-[80px] !px-4 !text-[13px]"
      >
        Menu
      </Button>
    </div>
  );
}

// --- 메인 컴포넌트 ---
export function PermissionsTable() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  const [activeOnly, setActiveOnly] = useState(true);
  const [newRow, setNewRow] = useState(false);
  const newRowFieldsRef = useRef<{ code: string; name: string; description: string }>({
    code: "",
    name: "",
    description: "",
  });

  // codes-header-table 패턴: 단일 cell 편집 state + 임시 입력값 ref
  // 입력 중 부모 setState 미발생 → focus 유지 (저장 시점에만 ref 에서 읽어감)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const editValuesRef = useRef<Record<string, string>>({});

  // AG Grid API ref + editingCell 변화 시 강제 cell refresh
  // (data 객체에 editingField 가 추가/제거되어도 셀 value 자체는 변하지 않아
  //  AG Grid 가 자동 refresh 하지 않으므로 수동 트리거 필요)
  const apiRef = useRef<GridApi<PermissionItem> | null>(null);
  const prevEditingRowIdRef = useRef<string | null>(null);
  const handleGridReady = useCallback((event: GridReadyEvent<PermissionItem>) => {
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

  // --- API 조회 (Plan R-01) ---
  const { data: roles = [], isError } = useQuery<RoleApiItem[]>({
    queryKey: ["roles", activeOnly],
    queryFn: async () => {
      const res = await api.get<RolesResponse>("/roles", {
        params: { activeOnly: String(activeOnly) },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // 변환 + editingField 주입 — items 를 useMemo 로 안정화하여 rowData 캐싱 무효화 방지
  const items: PermissionItem[] = useMemo(
    () => roles.map(toPermissionItem),
    [roles],
  );
  const rowData: PermissionItem[] = useMemo(() => {
    const mapped = items.map((item) => {
      if (editingCell && item.id === editingCell.rowId) {
        return { ...item, editingField: editingCell.field as "roleName" | "description" };
      }
      return item;
    });
    return newRow
      ? [
          { id: "new", roleCode: "", roleName: "", description: "", isActive: "Y" as const, isNew: true },
          ...mapped,
        ]
      : mapped;
  }, [items, editingCell, newRow]);

  // --- Mutations ---

  // 권한 추가
  const createMutation = useMutation({
    mutationFn: async (body: ReturnType<typeof toCreateRoleBody>) => {
      const res = await api.post("/roles", body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setNewRow(false);
      newRowFieldsRef.current = { code: "", name: "", description: "" };
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[POST /api/roles] 권한 추가 실패:", error);
      if (isAxiosError(error) && error.response?.status === 409) {
        openAlert({ type: "alert", message: "既に存在する権限コードです。", confirmLabel: "確認" });
      } else {
        openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
      }
    },
  });

  // 권한 수정 (단건)
  const updateMutation = useMutation({
    mutationFn: async ({ roleCode, body }: { roleCode: string; body: ReturnType<typeof toUpdateRoleBody> }) => {
      const res = await api.put(`/roles/${encodeURIComponent(roleCode)}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: unknown) => {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      console.error(`[PUT /api/roles] 권한 수정 실패: status=${status ?? "unknown"}`);
    },
  });

  // --- 편집 state 핸들러 ---

  const handleCellEditStart = useCallback((rowId: string, field: string) => {
    if (rowId.startsWith("new")) return;
    editValuesRef.current = {};
    setEditingCell({ rowId, field });
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    editValuesRef.current = {};
  }, []);

  const handleEditFieldChange = useCallback((field: string, value: string) => {
    editValuesRef.current[field] = value;
  }, []);

  // --- 신규행/저장 핸들러 ---

  const handleAdd = () => {
    if (newRow) return;
    handleEditCancel();
    newRowFieldsRef.current = { code: "", name: "", description: "" };
    setNewRow(true);
  };

  const handleCancelAdd = () => {
    setNewRow(false);
    newRowFieldsRef.current = { code: "", name: "", description: "" };
  };

  // 활성 토글 — 즉시 PUT (편집 모드 무관)
  const handleActiveChange = useCallback(async (item: PermissionItem, value: "Y" | "N") => {
    if (item.isNew) return;
    const merged: PermissionItem = { ...item, isActive: value };
    try {
      await updateMutation.mutateAsync({
        roleCode: item.roleCode,
        body: toUpdateRoleBody(merged),
      });
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      console.error(`[PermissionsTable] 활성 토글 실패: status=${status ?? "unknown"}`);
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    }
  }, [updateMutation, openAlert]);

  const onNewRowFieldChange = useCallback((field: string, value: string) => {
    const ref = newRowFieldsRef.current as Record<string, string>;
    ref[field] = value;
  }, []);

  // 통합 저장 — 신규행 등록 OR 단일 셀 편집 commit
  // useCallback 으로 안정화하여 handleKeyDown deps 에 정상 포함 (stale closure 회피)
  const handleSave = useCallback(async () => {
    // 신규행 저장
    if (newRow) {
      const fields = newRowFieldsRef.current;
      if (!fields.code.trim()) {
        openAlert({ type: "alert", message: "権限コードは必須です。", confirmLabel: "確認" });
        return;
      }
      if (!fields.name.trim()) {
        openAlert({ type: "alert", message: "権限名は必須です。", confirmLabel: "確認" });
        return;
      }
      createMutation.mutate(toCreateRoleBody(fields));
      return;
    }

    // 편집 중인 셀 저장
    if (!editingCell) return;
    const editValues = editValuesRef.current;
    const field = editingCell.field;
    if (editValues[field] === undefined) {
      // 변경 없음 → 편집만 종료
      handleEditCancel();
      return;
    }

    const original = items.find((i) => i.id === editingCell.rowId);
    if (!original) {
      handleEditCancel();
      return;
    }

    const merged: PermissionItem = {
      ...original,
      [field]: editValues[field],
    };

    try {
      await updateMutation.mutateAsync({
        roleCode: original.roleCode,
        body: toUpdateRoleBody(merged),
      });
      handleEditCancel();
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      console.error(`[PermissionsTable] 권한 수정 실패: status=${status ?? "unknown"}`);
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    }
  }, [newRow, editingCell, items, openAlert, createMutation, updateMutation, handleEditCancel]);

  // 키보드 — Enter 저장 / Escape 취소 (handleSave useCallback 으로 stale closure 회피)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  }, [handleSave, handleEditCancel]);

  // --- AG Grid 이벤트 ---
  const handleCellDoubleClicked = useCallback((event: CellDoubleClickedEvent<PermissionItem>) => {
    const data = event.data;
    const field = event.colDef.field;
    const colId = event.colDef.colId;
    if (!data || data.isNew || !field) return;
    if (NON_EDITABLE_FIELDS.has(field)) return;
    if (colId === "menuSetting") return; // Available Menu Setting 컬럼 제외
    handleCellEditStart(data.id, field);
  }, [handleCellEditStart]);

  const handleCellClicked = useCallback((event: CellClickedEvent<PermissionItem>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    handleEditCancel();
  }, [editingCell, handleEditCancel]);

  const getRowClass = useCallback((params: RowClassParams<PermissionItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  }, []);

  // --- context (useMemo 로 매 렌더 새 객체 방지) ---
  const gridContext = useMemo<PermissionGridContext>(() => ({
    newRowFieldsRef,
    onNewRowFieldChange,
    onEditFieldChange: handleEditFieldChange,
    onActiveChange: (item, value) => { void handleActiveChange(item, value); },
    onKeyDown: handleKeyDown,
  }), [onNewRowFieldChange, handleEditFieldChange, handleActiveChange, handleKeyDown]);

  // --- 컬럼 정의 ---
  const columnDefs = useMemo<ColDef<PermissionItem>[]>(() => [
    {
      headerName: "権限コード",
      field: "roleCode",
      flex: 1,
      cellRenderer: CodeRenderer,
      cellStyle: makeEditableCellStyle("roleCode"),
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "権限名",
      field: "roleName",
      flex: 1.5,
      cellRenderer: EditableTextRendererFn,
      cellStyle: makeEditableCellStyle("roleName"),
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: suppressKeyboardWhenEditing,
    },
    {
      headerName: "権限説明",
      field: "description",
      flex: 2,
      cellRenderer: EditableTextRendererFn,
      cellStyle: makeEditableCellStyle("description"),
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: suppressKeyboardWhenEditing,
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.8,
      cellRenderer: ActiveRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Available Menu Setting",
      field: "roleCode",
      colId: "menuSetting",
      flex: 1,
      cellRenderer: MenuRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
  ], []);

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 */}
      <div className="flex items-center justify-between">
        <Checkbox
          checked={activeOnly}
          onChange={setActiveOnly}
          label="使用可否がYの値のみ表示"
        />
        <div className="flex items-center gap-2">
          {newRow ? (
            <Button variant="outline" onClick={handleCancelAdd}>
              キャンセル
            </Button>
          ) : (
            <Button variant="outline" onClick={handleAdd}>
              追加
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => { void handleSave(); }}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            保存
          </Button>
        </div>
      </div>

      {/* AG Grid */}
      {isError ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="font-['Noto_Sans_JP'] text-[14px] text-[#E97923]">
            データの読み込みに失敗しました。
          </p>
        </div>
      ) : (
        <DataGrid<PermissionItem>
          columnDefs={columnDefs}
          rowData={rowData}
          getRowClass={getRowClass}
          getRowId={getRowIdFn}
          className="permissions-grid"
          context={gridContext}
          onCellDoubleClicked={handleCellDoubleClicked}
          onCellClicked={handleCellClicked}
          onGridReady={handleGridReady}
        />
      )}
    </div>
  );
}
