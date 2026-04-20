"use client";

// Design Ref: §4, §5 — codes-header-table 인라인 편집 패턴 참조

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
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

// AG Grid row 매칭 안정화 — id 기반 매칭으로 activeOnly 토글/refetch 시 row identity 유지
const getRowIdFn = (p: { data: PermissionItem }) => p.data.id;

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
      onClick={() => openPopup("permission-menu", { roleCode: data.roleCode, roleName: data.roleName })}
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
    // field: "roleCode" 와 colId 충돌 회피 — 別 컬럼이 같은 field 를 사용하므로 colId 명시
    field: "roleCode",
    colId: "menuSetting",
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

  // editedRows 의 ref 미러 — handleSave 에서 blur(flushSync) 직후
  // stale 클로저가 아닌 최신 값을 읽기 위함. flushSync 가 sync re-render 를 유발하므로
  // 이 useEffect 가 동기적으로 실행되어 ref 가 갱신된 뒤 handleSave 가 ref 를 읽는다.
  // (ref 할당은 setState 가 아니므로 react-hooks/set-state-in-effect 룰에 걸리지 않음)
  const editedRowsRef = useRef(editedRows);
  useEffect(() => {
    editedRowsRef.current = editedRows;
  }, [editedRows]);

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
  // 다건 저장은 handleSave 에서 Promise.allSettled 로 일괄 처리하므로
  // 개별 mutation 의 onSuccess 는 invalidate 만, 알림/setEditedRows 는 호출측 책임.
  const updateMutation = useMutation({
    mutationFn: async ({ roleCode, body }: { roleCode: string; body: ReturnType<typeof toUpdateRoleBody> }) => {
      // path 안전성 — 호출측에서 검증된 roleCode 도 인코딩하여 path 왜곡 방어
      const res = await api.put(`/roles/${encodeURIComponent(roleCode)}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: unknown) => {
      // 단일 alert 은 handleSave 에서 집계 — 여기서는 로깅만 (axios 객체 전체 노출 방지)
      const status = isAxiosError(error) ? error.response?.status : undefined;
      console.error(`[PUT /api/roles] 권한 수정 실패: status=${status ?? "unknown"}`);
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
  // CRITICAL: 다건 수정은 Promise.allSettled 로 일괄 처리 + 단일 alert + 실패 건만 editedRows 유지
  const handleSave = async () => {
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

    // CellInput 이 defaultValue + onBlur 패턴이라 입력 직후 Save 시 미커밋 위험
    // → 활성 input blur 강제로 onBlur 핸들러를 트리거하여 editedRows 에 반영
    // flushSync 로 setEditedRows 즉시 commit + editedRowsRef 동기화 보장 (stale closure 회피)
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        flushSync(() => { active.blur(); });
      }
    }

    // editedRows 클로저 대신 ref 에서 최신값 읽기
    const entries = Object.entries(editedRowsRef.current);
    if (entries.length === 0) return;

    const validEntries = entries.flatMap(([roleCode, changes]) => {
      const original = items.find((i) => i.roleCode === roleCode);
      if (!original) return [];
      const merged = { ...original, ...changes } as PermissionItem;
      return [{ roleCode, body: toUpdateRoleBody(merged) }];
    });
    if (validEntries.length === 0) return;

    const results = await Promise.allSettled(
      validEntries.map((e) => updateMutation.mutateAsync({ roleCode: e.roleCode, body: e.body })),
    );
    const failedRoleCodes = results
      .map((r, i) => (r.status === "rejected" ? validEntries[i].roleCode : null))
      .filter((x): x is string => x !== null);

    if (failedRoleCodes.length === 0) {
      setEditedRows({});
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } else {
      // 실패 건만 editedRows 에 유지 — 사용자가 재시도 가능
      setEditedRows((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => failedRoleCodes.includes(k))),
      );
      openAlert({
        type: "alert",
        message: `${failedRoleCodes.length}件の保存に失敗しました。`,
        confirmLabel: "確認",
      });
    }
  };

  const onNewRowFieldChange = (field: string, value: string) => {
    const ref = newRowFieldsRef.current as Record<string, string>;
    ref[field] = value;
  };

  // 통합 commit 핸들러 — onCommitField(select)/onFinishEdit(text blur) 모두 사용
  // editingField 를 항상 undefined 로 리셋하여 편집 모드 종료 보장
  const onCommitField = (roleCode: string, field: string, value: string) => {
    setEditedRows((prev) => {
      const existing = prev[roleCode] ?? {};
      return {
        ...prev,
        [roleCode]: {
          ...existing,
          editingField: undefined,
          [field]: value,
        },
      };
    });
  };

  const getRowClass = (params: RowClassParams<PermissionItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  const onStartEdit = (roleCode: string, field: string) => {
    setEditedRows((prev) => ({
      ...prev,
      [roleCode]: { ...prev[roleCode], editingField: field as "roleName" | "description" },
    }));
  };

  // 텍스트 편집 blur 후 commit — 통합 핸들러로 위임
  const onFinishEdit = (roleCode: string, field: string, value: string) => {
    onCommitField(roleCode, field, value);
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
        />
      )}
    </div>
  );
}
