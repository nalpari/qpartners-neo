"use client";

// Design Ref: §4, §5 — codes-header-table 인라인 편집 패턴 참조

import { useState, useRef } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { ColDef, ICellRendererParams, RowClassParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import { useAlertStore, usePopupStore } from "@/lib/store";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import type { RoleApiItem, RolesResponse, PermissionItem } from "./permissions-types";
import { toPermissionItem, toCreateRoleBody, toUpdateRoleBody } from "./permissions-types";

// --- AG Grid Context 타입 (Design §4.1) ---
interface PermissionGridContext {
  [key: string]: unknown;
  newRowFieldsRef: React.RefObject<{ code: string; name: string; description: string }>;
  onNewRowFieldChange: (field: string, value: string) => void;
  onCommitField: (roleCode: string, field: string, value: string) => void;
  onStartEdit: (roleCode: string, field: string) => void;
  onFinishEdit: (roleCode: string, field: string, value: string) => void;
}

// --- CellInput (codes-header-table 패턴) ---
function CellInput({
  defaultValue,
  placeholder,
  onChange,
  onBlur,
  autoFocus,
}: {
  defaultValue: string;
  placeholder: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
    />
  );
}

// --- Cell Renderers (파일 스코프 — AG Grid 리렌더링 최적화) ---

// Design Ref: §5.6 — 신규: CellInput, 기존: Read-only 텍스트
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

// Design Ref: §6 — 신규: CellInput(ref/onChange), 기존: 텍스트 → 더블클릭 → input(onBlur 커밋)
function NameRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as PermissionGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.name ?? ""}
        placeholder="権限名入力"
        onChange={(v) => ctx.onNewRowFieldChange("name", v)}
      />
    );
  }
  if (data.editingField === "roleName") {
    return (
      <CellInput
        defaultValue={data.roleName}
        placeholder="権限名入力"
        autoFocus
        onBlur={(v) => ctx.onFinishEdit(data.roleCode, "roleName", v)}
      />
    );
  }
  return (
    <span
      className="font-['Noto_Sans_JP'] text-[14px] text-[#555] cursor-pointer w-full block"
      onDoubleClick={() => ctx.onStartEdit(data.roleCode, "roleName")}
    >
      {data.roleName || "\u00A0"}
    </span>
  );
}

function DescRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data) return null;
  const ctx = params.context as PermissionGridContext;
  if (data.isNew) {
    return (
      <CellInput
        defaultValue={ctx.newRowFieldsRef.current.description ?? ""}
        placeholder="説明入力"
        onChange={(v) => ctx.onNewRowFieldChange("description", v)}
      />
    );
  }
  if (data.editingField === "description") {
    return (
      <CellInput
        defaultValue={data.description}
        placeholder="説明入力"
        autoFocus
        onBlur={(v) => ctx.onFinishEdit(data.roleCode, "description", v)}
      />
    );
  }
  return (
    <span
      className="font-['Noto_Sans_JP'] text-[14px] text-[#555] cursor-pointer w-full block"
      onDoubleClick={() => ctx.onStartEdit(data.roleCode, "description")}
    >
      {data.description || "\u00A0"}
    </span>
  );
}

// Design Ref: §6 — 신규: 미표시, 기존: select Y/N
function ActiveRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  const ctx = params.context as PermissionGridContext;
  return (
    <div className="relative w-[100px]">
      <select
        value={data.isActive}
        onChange={(e) => ctx.onCommitField(data.roleCode, "isActive", e.target.value)}
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

// Design Ref: §6 — 신규: 미표시, 기존: Menu 버튼
function MenuRenderer(params: ICellRendererParams<PermissionItem>) {
  const data = params.data;
  if (!data || data.isNew) return null;
  const openPopup = usePopupStore.getState().openPopup;
  return (
    <Button
      variant="outline"
      onClick={() => openPopup("permission-menu", { permissionName: data.roleName })}
      className="!h-[38px] !min-w-[80px] !px-4 !text-[13px]"
    >
      Menu
    </Button>
  );
}

// --- 컬럼 정의 ---
const columnDefs: ColDef<PermissionItem>[] = [
  {
    headerName: "権限コード",
    field: "roleCode",
    flex: 1,
    cellRenderer: CodeRenderer,
    cellStyle: CENTER_CELL_STYLE,
    headerClass: "ag-header-cell-center",
    suppressKeyboardEvent: () => true,
  },
  {
    headerName: "権限名",
    field: "roleName",
    flex: 1.5,
    cellRenderer: NameRenderer,
    headerClass: "ag-header-cell-center",
    suppressKeyboardEvent: () => true,
  },
  {
    headerName: "権限説明",
    field: "description",
    flex: 2,
    cellRenderer: DescRenderer,
    headerClass: "ag-header-cell-center",
    suppressKeyboardEvent: () => true,
  },
  {
    headerName: "使用可否",
    field: "isActive",
    flex: 0.8,
    cellRenderer: ActiveRenderer,
    cellStyle: CENTER_CELL_STYLE,
    headerClass: "ag-header-cell-center",
  },
  {
    headerName: "Available Menu Setting",
    field: "roleCode",
    flex: 1,
    cellRenderer: MenuRenderer,
    cellStyle: CENTER_CELL_STYLE,
    headerClass: "ag-header-cell-center",
  },
];

// --- 메인 컴포넌트 ---
export function PermissionsTable() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  const [activeOnly, setActiveOnly] = useState(false);
  const [newRow, setNewRow] = useState(false);
  const newRowFieldsRef = useRef<{ code: string; name: string; description: string }>({ code: "", name: "", description: "" });
  const [editedRows, setEditedRows] = useState<Record<string, Partial<PermissionItem>>>({});

  // --- API 조회 (Plan R-01) ---
  const { data: roles = [] } = useQuery<RoleApiItem[]>({
    queryKey: ["roles", activeOnly],
    queryFn: async () => {
      const res = await api.get<RolesResponse>("/roles", {
        params: { activeOnly: String(activeOnly) },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // 변환 + 수정값 병합
  const items: PermissionItem[] = roles.map(toPermissionItem);
  const mergedItems = items.map((item) => ({
    ...item,
    ...editedRows[item.roleCode],
  }));
  const rowData: PermissionItem[] = newRow
    ? [{ id: "new", roleCode: "", roleName: "", description: "", isActive: "Y" as const, isNew: true }, ...mergedItems]
    : mergedItems;

  // --- Mutations ---

  // Plan R-04: POST /api/roles — 권한 추가
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

  // Plan R-05: PUT /api/roles/{roleCode} — 권한 수정
  const updateMutation = useMutation({
    mutationFn: async ({ roleCode, body }: { roleCode: string; body: ReturnType<typeof toUpdateRoleBody> }) => {
      const res = await api.put(`/roles/${roleCode}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setEditedRows({});
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[PUT /api/roles] 권한 수정 실패:", error);
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    },
  });

  // --- 핸들러 ---

  const handleAdd = () => {
    if (newRow) return;
    newRowFieldsRef.current = { code: "", name: "", description: "" };
    setNewRow(true);
  };

  const handleCancelAdd = () => {
    setNewRow(false);
    newRowFieldsRef.current = { code: "", name: "", description: "" };
  };

  // Design Ref: §5.4 — 신규/수정 분기
  const handleSave = () => {
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
    } else {
      const entries = Object.entries(editedRows);
      if (entries.length === 0) return;
      for (const [roleCode, changes] of entries) {
        const original = items.find((i) => i.roleCode === roleCode);
        if (!original) continue;
        const merged = { ...original, ...changes } as PermissionItem;
        updateMutation.mutate({ roleCode, body: toUpdateRoleBody(merged) });
      }
    }
  };

  const onNewRowFieldChange = (field: string, value: string) => {
    const ref = newRowFieldsRef.current as Record<string, string>;
    ref[field] = value;
  };

  const onCommitField = (roleCode: string, field: string, value: string) => {
    setEditedRows((prev) => ({
      ...prev,
      [roleCode]: { ...prev[roleCode], [field]: value },
    }));
  };

  const getRowClass = (params: RowClassParams<PermissionItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  const onStartEdit = (roleCode: string, field: string) => {
    setEditedRows((prev) => ({
      ...prev,
      [roleCode]: { ...prev[roleCode], editingField: field },
    }));
  };

  const onFinishEdit = (roleCode: string, field: string, value: string) => {
    setEditedRows((prev) => ({
      ...prev,
      [roleCode]: { ...prev[roleCode], [field]: value },
    }));
  };

  // --- context ---
  const gridContext: PermissionGridContext = {
    newRowFieldsRef,
    onNewRowFieldChange,
    onCommitField,
    onStartEdit,
    onFinishEdit,
  };

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
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>

      {/* AG Grid */}
      {rowData.length === 0 ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
            データがありません
          </p>
        </div>
      ) : (
        <DataGrid<PermissionItem>
          columnDefs={columnDefs}
          rowData={rowData}
          getRowClass={getRowClass}
          className="permissions-grid"
          context={gridContext}
        />
      )}
    </div>
  );
}
