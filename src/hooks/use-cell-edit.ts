"use client";

import { useState, useRef, useCallback } from "react";
import type { AlertOptions } from "@/lib/store";

type OpenAlert = (options: AlertOptions) => void;

export interface EditingCell {
  rowId: string;
  field: string;
}

/** 행별 pending 변경값 — `pendingChanges[rowId][field] = "사용자가 입력한 문자열"` */
export type PendingChanges = Record<string, Record<string, string>>;

/**
 * 셀 편집 상태 + 미저장 변경 누적 훅 — 더블클릭 편집 → blur 시 pending 누적 → 일괄 저장 패턴.
 *
 * Responsibility:
 * - 현재 편집 중인 셀 위치(editingCell)와 임시 입력값(detailEditRef) 보유 (편집 중 re-render 차단)
 * - blur·다른 셀 클릭·다음 셀 편집 시작 시 현재 편집값을 `pendingChanges` 로 commit
 * - 여러 행/필드의 변경을 누적해 두고 호출측이 일괄 저장 (`/api PUT × N`)
 * - Escape 만 commit 없이 폐기, 그 외 화면 이탈은 모두 commit (사용자 입력 유실 차단)
 *
 * pendingChanges 구조:
 *   `{ [rowId]: { [field]: stringValue } }`
 *   값은 항상 string — 호출측이 number/boolean 으로 변환 (sortOrder 등)
 *
 * 신규행(`new-` prefix) 은 별도 흐름이라 본 훅 비대상 — handleCellEditStart 가 무시한다.
 */
export function useCellEdit({ openAlert }: { openAlert: OpenAlert }) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const detailEditRef = useRef<Record<string, string>>({});
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});

  /** 현재 input 값을 pending 으로 이동. editingCell 정리. */
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const value = detailEditRef.current[editingCell.field];
    if (value !== undefined) {
      const rowId = editingCell.rowId;
      const field = editingCell.field;
      setPendingChanges((prev) => {
        const rowChanges = { ...(prev[rowId] ?? {}) };
        rowChanges[field] = value;
        return { ...prev, [rowId]: rowChanges };
      });
    }
    detailEditRef.current = {};
    setEditingCell(null);
  }, [editingCell]);

  const handleCellEditStart = useCallback((rowId: string, field: string) => {
    // 신규행(id prefix "new-")은 행 자체가 입력 폼 상태이므로 셀 편집 진입 불필요
    if (rowId.startsWith("new-")) return;
    // 다른 셀로 편집 전환 시 이전 편집값을 pending 에 commit (입력 유실 차단)
    commitEdit();
    detailEditRef.current = {};
    setEditingCell({ rowId, field });
  }, [commitEdit]);

  /** Escape — pending 반영 없이 폐기 */
  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    detailEditRef.current = {};
  }, []);

  /** Header 전환 등 컨텍스트 이탈 — pending 누적값이 있으면 확인 다이얼로그 */
  const handleRequestEditCancel = useCallback((onConfirm?: () => void) => {
    const hasUnsaved =
      (editingCell && Object.keys(detailEditRef.current).length > 0) ||
      Object.keys(pendingChanges).length > 0;
    if (hasUnsaved) {
      openAlert({
        type: "confirm",
        message: "編集中のデータが破棄されます。よろしいですか？",
        onConfirm: () => {
          setEditingCell(null);
          detailEditRef.current = {};
          setPendingChanges({});
          onConfirm?.();
        },
      });
      return;
    }
    setEditingCell(null);
    detailEditRef.current = {};
    onConfirm?.();
  }, [editingCell, openAlert, pendingChanges]);

  const handleEditFieldChange = useCallback((field: string, value: string) => {
    detailEditRef.current[field] = value;
  }, []);

  /** 셀 편집 흐름을 거치지 않고 pending 에 직접 기록 — Y/N native select 등 즉시 결정값 입력용 */
  const setPendingField = useCallback((rowId: string, field: string, value: string) => {
    if (rowId.startsWith("new-")) return;
    setPendingChanges((prev) => {
      const rowChanges = { ...(prev[rowId] ?? {}) };
      rowChanges[field] = value;
      return { ...prev, [rowId]: rowChanges };
    });
  }, []);

  /** 저장 성공 후 호출 — pending 전체 초기화 */
  const clearPending = useCallback(() => {
    setPendingChanges({});
  }, []);

  /** 특정 행의 pending 만 제거 — 행별 저장 성공 시 호출 가능 (옵션) */
  const discardRowPending = useCallback((rowId: string) => {
    setPendingChanges((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  return {
    editingCell,
    detailEditRef,
    pendingChanges,
    handleCellEditStart,
    handleEditCancel,
    handleRequestEditCancel,
    handleEditFieldChange,
    commitEdit,
    setPendingField,
    clearPending,
    discardRowPending,
  };
}
