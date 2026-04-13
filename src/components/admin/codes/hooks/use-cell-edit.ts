"use client";

import { useState, useRef, useCallback } from "react";
import type { AlertOptions } from "@/lib/store";

type OpenAlert = (options: AlertOptions) => void;

export interface EditingCell {
  rowId: string;
  field: string;
}

/**
 * 셀 편집 상태를 캡슐화한 훅 — editingCell + detailEditRef + 핸들러들.
 *
 * Responsibility:
 * - 현재 편집 중인 셀 위치(editingCell)와 임시 입력값(detailEditRef) 보유
 * - 편집 시작/취소/확인 다이얼로그 경유 취소 핸들러 제공
 *
 * detailEditRef를 state가 아닌 ref로 관리하는 이유:
 * 입력 중 re-render를 피하고 저장 시점에만 값을 읽어가기 위함.
 */
export function useCellEdit({ openAlert }: { openAlert: OpenAlert }) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const detailEditRef = useRef<Record<string, string>>({});

  const handleCellEditStart = useCallback((rowId: string, field: string) => {
    // 신규행(id prefix "new-")은 행 자체가 입력 폼 상태이므로 셀 편집 진입 불필요
    if (rowId.startsWith("new-")) return;
    detailEditRef.current = {};
    setEditingCell({ rowId, field });
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    detailEditRef.current = {};
  }, []);

  // 편집 중 셀/헤더 전환 시 미저장 값이 있으면 확인 다이얼로그 표시
  // onConfirm: 확인 후 실행할 후속 동작 (없으면 단순 취소)
  const handleRequestEditCancel = useCallback((onConfirm?: () => void) => {
    const hasUnsaved = editingCell && Object.keys(detailEditRef.current).length > 0;
    if (hasUnsaved) {
      openAlert({
        type: "confirm",
        message: "編集中のデータが破棄されます。よろしいですか？",
        onConfirm: () => {
          setEditingCell(null);
          detailEditRef.current = {};
          onConfirm?.();
        },
      });
      return;
    }
    setEditingCell(null);
    detailEditRef.current = {};
    onConfirm?.();
  }, [editingCell, openAlert]);

  const handleEditFieldChange = useCallback((field: string, value: string) => {
    detailEditRef.current[field] = value;
  }, []);

  return {
    editingCell,
    detailEditRef,
    handleCellEditStart,
    handleEditCancel,
    handleRequestEditCancel,
    handleEditFieldChange,
  };
}
