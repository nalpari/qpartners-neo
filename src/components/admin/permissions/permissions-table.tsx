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
import { extractApiError } from "@/lib/api-error";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import { useAlertStore, usePopupStore } from "@/lib/store";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import { useCellEdit } from "@/hooks/use-cell-edit";
import type { RoleApiItem, RolesResponse, PermissionItem } from "./permissions-types";
import { toPermissionItem, toCreateRoleBody, toUpdateRoleBody, rolesQueryKey } from "./permissions-types";

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
  const [isSaving, setIsSaving] = useState(false);
  const newRowFieldsRef = useRef<{ code: string; name: string; description: string }>({
    code: "",
    name: "",
    description: "",
  });

  // 코드관리와 동일 패턴: useCellEdit 훅으로 단일 셀 편집 + 다중 행 pending 누적 관리.
  // - 더블클릭 → editingCell 설정 / blur·다른 셀 클릭 → commitEdit 으로 pending 이동
  // - Y/N select onChange → setPendingField 로 직접 누적 (즉시 PUT 안 함)
  // - 「保存」 클릭 → pending 행별 PUT 일괄 처리 후 clearPending
  const cellEdit = useCellEdit({ openAlert });
  const {
    editingCell,
    detailEditRef: editValuesRef,
    pendingChanges,
    handleCellEditStart,
    handleEditCancel,
    handleEditFieldChange,
    commitEdit,
    setPendingField,
    discardRowPending,
    clearPending,
  } = cellEdit;

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
    queryKey: rolesQueryKey(activeOnly),
    queryFn: async () => {
      const res = await api.get<RolesResponse>("/roles", {
        params: { activeOnly: String(activeOnly) },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // 변환 + pending overlay + editingField 주입.
  // pending 값(roleName/description: string, isActive: "Y"|"N") 을 row 위에 덮어 그리드가
  // 누적 수정 상태를 즉시 반영하도록 한다.
  const items: PermissionItem[] = useMemo(
    () => roles.map(toPermissionItem),
    [roles],
  );
  const rowData: PermissionItem[] = useMemo(() => {
    const mapped = items.map((item) => {
      const pending = pendingChanges[item.id];
      let merged: PermissionItem = item;
      if (pending) {
        merged = { ...item };
        for (const [field, value] of Object.entries(pending)) {
          if (field === "isActive") {
            if (value === "Y" || value === "N") merged.isActive = value;
          } else if (field === "roleName" || field === "description") {
            merged[field] = value;
          }
        }
      }
      if (editingCell && merged.id === editingCell.rowId) {
        return { ...merged, editingField: editingCell.field as "roleName" | "description" };
      }
      return merged;
    });
    return newRow
      ? [
          // id prefix "new-" 통일 — useCellEdit 의 신규행 가드(startsWith("new-")) 와 일치시켜
          // 더블클릭 가드 우회로 편집 모드 진입하는 결함 차단 (PR #139 리뷰 MEDIUM 지적).
          { id: "new-row", roleCode: "", roleName: "", description: "", isActive: "Y" as const, isNew: true },
          ...mapped,
        ]
      : mapped;
  }, [items, editingCell, newRow, pendingChanges]);

  // --- Mutations ---

  // 권한 추가
  const createMutation = useMutation({
    mutationFn: async (body: ReturnType<typeof toCreateRoleBody>) => {
      const res = await api.post("/roles", body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKey() });
      // 콘텐츠 게시대상 라벨 캐시(useTargetLabels) 도 즉시 갱신 — 권한명 변경이 사용자 화면에
      // 바로 반영되도록 한다. (PAGE_SIZE/USER_TYPE 의 ["common-code"] invalidate 패턴과 동일)
      queryClient.invalidateQueries({ queryKey: ["role-labels"] });
      setNewRow(false);
      newRowFieldsRef.current = { code: "", name: "", description: "" };
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[POST /api/roles] 권한 추가 실패:", error);
      if (isAxiosError(error) && error.response?.status === 409) {
        openAlert({ type: "alert", message: "既に存在する権限コードです。", confirmLabel: "確認" });
        return;
      }
      // 서버 응답의 첫 위반 메시지(예: "権限コードは英大文字で始めてください") 를 그대로 노출 (Redmine #2165).
      // 응답 본문 형식이 예상과 다르면 일반 메시지로 폴백.
      const msg = extractApiError(error) ?? "保存に失敗しました。";
      openAlert({ type: "alert", message: msg, confirmLabel: "確認" });
    },
  });

  // 권한 수정 (단건)
  const updateMutation = useMutation({
    mutationFn: async ({ roleCode, body }: { roleCode: string; body: ReturnType<typeof toUpdateRoleBody> }) => {
      const res = await api.put(`/roles/${encodeURIComponent(roleCode)}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolesQueryKey() });
      // 콘텐츠 게시대상 라벨 캐시도 즉시 갱신 — 권한명/사용가능여부 변경 즉시 반영.
      queryClient.invalidateQueries({ queryKey: ["role-labels"] });
    },
    onError: (error: unknown) => {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      console.error(`[PUT /api/roles] 권한 수정 실패: status=${status ?? "unknown"}`);
    },
  });

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

  // Y/N select 변경 — 즉시 PUT 안 함, pending 누적. 「保存」 클릭 시 일괄 처리.
  const handleActiveChange = useCallback((item: PermissionItem, value: "Y" | "N") => {
    if (item.isNew) return;
    setPendingField(item.id, "isActive", value);
  }, [setPendingField]);

  const onNewRowFieldChange = useCallback((field: string, value: string) => {
    const ref = newRowFieldsRef.current as Record<string, string>;
    ref[field] = value;
  }, []);

  // 통합 저장 — 신규행 등록 + 편집중 셀 commit + 누적 pending 일괄 PUT.
  // 처리 순서:
  //   1) 신규행 등록 (validation 후 createMutation)
  //   2) 편집중 셀이 있으면 commitEdit 으로 pending 에 옮김
  //   3) pending 행별로 toUpdateRoleBody 변환 후 updateMutation 호출
  //   4) 모두 성공 시 pending + 편집 state 정리 + 단일 alert
  const handleSave = useCallback(async () => {
    if (isSaving) return;

    // 1) 신규행 — 단건 POST. 신규행 분기에도 isSaving 가드 적용으로 중복 클릭 차단
    // (createMutation.isPending 만으로는 alert/네트워크 race 시 짧은 틈 존재).
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
      setIsSaving(true);
      try {
        await createMutation.mutateAsync(toCreateRoleBody(fields));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // 2) 편집중 셀 → 스냅샷 추출 후 commitEdit.
    // 주의: commitEdit() 가 detailEditRef 를 동기 초기화하므로(use-cell-edit.ts:49),
    // ref 스냅샷은 반드시 commitEdit 호출 전에 확보해야 한다. 호출 후에 읽으면 빈 객체라
    // 편집 중인 셀의 입력값이 PUT 에 누락된다 (PR #139 리뷰 HIGH 지적).
    const extra: Record<string, Record<string, string>> = {};
    if (editingCell && !editingCell.rowId.startsWith("new-")) {
      const v = editValuesRef.current[editingCell.field];
      if (v !== undefined) {
        extra[editingCell.rowId] = { [editingCell.field]: v };
      }
      commitEdit();
    }

    // 3) pending + extra 머지 — extra 는 현재 렌더의 pendingChanges 에 아직 반영 안 됐으므로
    // 호출 측에서 명시적으로 합쳐 jobs 를 구성한다.
    const jobs: Record<string, Record<string, string>> = { ...pendingChanges };
    for (const [rowId, fields] of Object.entries(extra)) {
      jobs[rowId] = { ...jobs[rowId], ...fields };
    }
    if (Object.keys(jobs).length === 0) {
      handleEditCancel();
      return;
    }

    setIsSaving(true);
    try {
      // Promise.allSettled 로 병렬 PUT — RTT × N 직렬 대기 회피.
      // 성공한 행은 즉시 discardRowPending 으로 제거하여, 부분 실패 시 다음 「保存」 클릭 시
      // 이미 반영된 행의 중복 PUT 발생을 차단한다 (PR #139 리뷰 HIGH 지적).
      const entries = Object.entries(jobs);
      const results = await Promise.allSettled(
        entries.map(async ([rowId, fields]) => {
          const original = items.find((i) => i.id === rowId);
          if (!original) {
            return { rowId, skipped: true as const };
          }
          const merged: PermissionItem = { ...original };
          for (const [field, value] of Object.entries(fields)) {
            if (field === "isActive") {
              if (value === "Y" || value === "N") merged.isActive = value;
            } else if (field === "roleName" || field === "description") {
              merged[field] = value;
            }
          }
          await updateMutation.mutateAsync({
            roleCode: original.roleCode,
            body: toUpdateRoleBody(merged),
          });
          return { rowId, skipped: false as const };
        }),
      );

      // 성공 행만 pending 제거 — 실패/skip 행은 잔류시켜 사용자가 재시도해도 안전.
      const failures: unknown[] = [];
      for (const result of results) {
        if (result.status === "fulfilled" && !result.value.skipped) {
          discardRowPending(result.value.rowId);
        } else if (result.status === "rejected") {
          failures.push(result.reason);
        }
      }

      if (failures.length === 0) {
        // 전체 성공 — pending 완전 정리 (skipped 행이 잔류하지 않도록 clearPending 호출).
        clearPending();
        handleEditCancel();
        openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
      } else {
        const successCount = results.length - failures.length;
        const firstError = failures[0];
        const status = isAxiosError(firstError) ? firstError.response?.status : undefined;
        console.error(
          `[PermissionsTable] 권한 수정 실패: status=${status ?? "unknown"} (${failures.length}/${results.length})`,
        );
        // 서버 응답의 첫 위반 메시지 + 부분 성공 카운트 표시 (PR #139 리뷰 MEDIUM 지적).
        const baseMsg = extractApiError(firstError) ?? "保存に失敗しました。";
        const msg = `${baseMsg}\n(${successCount}/${results.length}件保存済み)`;
        openAlert({ type: "alert", message: msg, confirmLabel: "確認" });
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    newRow,
    editingCell,
    items,
    pendingChanges,
    createMutation,
    updateMutation,
    commitEdit,
    discardRowPending,
    clearPending,
    handleEditCancel,
    // editValuesRef: useRef 객체로 렌더 간 reference 동일 — 실질 deps 효과 없으나
    // react-hooks/exhaustive-deps 룰 충족 + 컨벤션 일관성 위해 명시.
    editValuesRef,
    openAlert,
  ]);

  // 키보드 — Enter: 현재 셀 commit (pending 누적) / Escape: 입력 폐기.
  // 서버 저장은 상단 「保存」 버튼만 트리거.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  }, [commitEdit, handleEditCancel]);

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

  // 편집 중 외부 셀 클릭 → 입력값을 pending 으로 commit 하고 편집 종료
  const handleCellClicked = useCallback((event: CellClickedEvent<PermissionItem>) => {
    if (!editingCell) return;
    const data = event.data;
    const field = event.colDef.field;
    if (data?.id === editingCell.rowId && field === editingCell.field) return;
    commitEdit();
  }, [editingCell, commitEdit]);

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
            disabled={isSaving || createMutation.isPending || updateMutation.isPending}
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
