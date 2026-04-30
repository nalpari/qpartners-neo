"use client";

import { useState, useCallback } from "react";
import { isAxiosError } from "axios";
import { useAlertStore } from "@/lib/store";
import { CodesSearch } from "./codes-search";
import { CodesHeaderTable } from "./codes-header-table";
import { CodesDetailTable } from "./codes-detail-table";
import type { HeaderGridRow, DetailGridRow } from "./codes-types";
import { toHeaderGridRow, toDetailGridRow, DETAIL_NULLABLE_FIELDS, HEADER_NULLABLE_FIELDS, HEADER_NUMERIC_FIELDS } from "./codes-types";
import { useCodeHeaders } from "./hooks/use-code-headers";
import { useCodeDetails } from "./hooks/use-code-details";
import { useCellEdit } from "@/hooks/use-cell-edit";

/**
 * 클라이언트 검증 실패를 나타내는 커스텀 에러.
 * handleSave 최상위 catch에서 userMessage를 그대로 alert에 표시하고 status 로깅은 skip.
 */
class ValidationError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "ValidationError";
  }
}

/**
 * handleSave의 단계별 에러 throw 유틸 — primitive err도 안전하게 감싸서 _stage 부착.
 * AxiosError 같은 Error 파생 인스턴스는 그대로 _stage만 주입하고 cause 체인을 유지.
 */
function throwWithStage(err: unknown, stage: string): never {
  if (err instanceof Error) {
    (err as Error & { _stage?: string })._stage = stage;
    throw err;
  }
  const wrapped = new Error(`${stage} failed`, { cause: err });
  (wrapped as Error & { _stage?: string })._stage = stage;
  throw wrapped;
}

// API 에러 → 유저 대면 메시지 변환 (단계 prefix 부착)
function getApiErrorMessage(err: unknown, stage?: string): string {
  const prefix = stage ? `${stage}: ` : "";
  if (!isAxiosError(err)) return `${prefix}サーバーエラーが発生しました。`;
  const status = err.response?.status;
  // 400 응답은 서버가 도메인 메시지(예: "SEC_AUTH_VALIDITY は 1〜90 日…")로
  // 안내하는 경우가 있으므로 `data.error` 가 문자열이면 그대로 노출, 아니면 폴백.
  if (status === 400) {
    const responseData = err.response?.data;
    const serverMsg =
      typeof responseData === "object" &&
      responseData !== null &&
      "error" in responseData &&
      typeof (responseData as { error: unknown }).error === "string"
        ? (responseData as { error: string }).error
        : undefined;
    if (serverMsg && serverMsg.length > 0) return `${prefix}${serverMsg}`;
    return `${prefix}入力値を確認してください。`;
  }
  switch (status) {
    case 401: return "ログインが必要です。";
    case 403: return "権限がありません。";
    case 404: return `${prefix}データが見つかりません。`;
    case 409: return `${prefix}既に存在するコードです。`;
    default: return `${prefix}サーバーエラーが発生しました。`;
  }
}

export function CodesContents() {
  const { openAlert } = useAlertStore();

  // 공유 state — 두 훅의 연결점
  const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 관심사별 훅 분리
  const headers = useCodeHeaders();
  // 두 테이블 각각 독립된 편집 state — useCellEdit 의 두 인스턴스
  const detailEdit = useCellEdit({ openAlert });
  const headerEdit = useCellEdit({ openAlert });

  const selectedHeader = headers.headersRaw.find((h) => h.id === selectedHeaderId);
  const selectedHeaderCode = selectedHeader?.headerCode ?? "";

  const details = useCodeDetails({ selectedHeaderId, selectedHeaderCode });

  // useCallback deps 안정화를 위해 훅 반환값에서 실제 사용 필드만 구조분해
  const {
    headerNewRow,
    headerNewRowRef,
    headerCreateMutation,
    headerUpdateMutation,
  } = headers;
  const {
    detailNewRow,
    detailNewRowRef,
    detailCreateMutation,
    detailUpdateMutation,
    resetDetailNewRow,
  } = details;
  const {
    editingCell,
    detailEditRef,
    pendingChanges: detailPending,
    handleEditCancel,
    handleRequestEditCancel,
    commitEdit: commitDetailEdit,
    setPendingField: setDetailPendingField,
    clearPending: clearDetailPending,
  } = detailEdit;
  const {
    editingCell: headerEditingCell,
    detailEditRef: headerEditRef,
    pendingChanges: headerPending,
    handleCellEditStart: handleHeaderCellEditStart,
    handleEditCancel: handleHeaderEditCancel,
    handleEditFieldChange: handleHeaderEditFieldChange,
    commitEdit: commitHeaderEdit,
    setPendingField: setHeaderPendingField,
    clearPending: clearHeaderPending,
  } = headerEdit;

  // pending 변경값을 row 위에 overlay — 셀 표시·재진입 편집 시 default 값이 pending 으로 노출.
  // 문자열 필드는 그대로, sortOrder 는 number, isActive 는 "Y"|"N" 로 타입 변환.
  const applyHeaderPending = (row: HeaderGridRow, pending: Record<string, string>): HeaderGridRow => {
    const merged: HeaderGridRow = { ...row };
    for (const [field, value] of Object.entries(pending)) {
      if ((HEADER_NUMERIC_FIELDS as readonly string[]).includes(field)) {
        // 숫자 필드(relNum1~3) — 표시용으로만 string 보관 (저장 시점에 number 변환).
        // HeaderGridRow.relNum1/2/3 은 string 이라 그대로 대입.
        (merged as unknown as Record<string, unknown>)[field] = value;
      } else if (field === "isActive") {
        if (value === "Y" || value === "N") merged.isActive = value;
      } else if (field in merged) {
        (merged as unknown as Record<string, unknown>)[field] = value;
      }
    }
    return merged;
  };
  const applyDetailPending = (row: DetailGridRow, pending: Record<string, string>): DetailGridRow => {
    const merged: DetailGridRow = { ...row };
    for (const [field, value] of Object.entries(pending)) {
      if (field === "sortOrder") {
        const n = Number(value);
        if (Number.isFinite(n) && Number.isInteger(n)) merged.sortOrder = n;
      } else if (field === "isActive") {
        if (value === "Y" || value === "N") merged.isActive = value;
      } else if (field in merged) {
        (merged as unknown as Record<string, unknown>)[field] = value;
      }
    }
    return merged;
  };

  // Grid 표시용 데이터 — pending overlay + editingField 주입
  const headerRows: HeaderGridRow[] = [
    ...(headerNewRow ? [headerNewRow] : []),
    ...headers.headersRaw.map((h) => {
      const baseRow = toHeaderGridRow(h);
      const pending = headerPending[baseRow.id];
      const row = pending ? applyHeaderPending(baseRow, pending) : baseRow;
      if (headerEditingCell && row.id === headerEditingCell.rowId) {
        return { ...row, editingField: headerEditingCell.field };
      }
      return row;
    }),
  ];

  const detailRows: DetailGridRow[] = [
    ...(detailNewRow ? [detailNewRow] : []),
    ...details.detailsRaw.map((d) => {
      const baseRow = toDetailGridRow(d, selectedHeaderCode);
      const pending = detailPending[baseRow.id];
      const row = pending ? applyDetailPending(baseRow, pending) : baseRow;
      if (editingCell && row.id === editingCell.rowId) {
        return { ...row, editingField: editingCell.field };
      }
      return row;
    }),
  ];

  // Header 클릭 — NaN 가드 + 편집 중 전환 확인 다이얼로그
  const handleHeaderClick = useCallback((id: string) => {
    if (id.startsWith("new-")) return;
    const numId = Number(id);
    if (!Number.isFinite(numId)) return;
    handleRequestEditCancel(() => {
      setSelectedHeaderId(numId);
      resetDetailNewRow();
    });
  }, [handleRequestEditCancel, resetDetailNewRow]);

  // 使用可否(isActive) 변경 — pending 누적 (즉시 PUT 안 함, 「保存」 버튼에서 일괄 처리).
  // 신규행은 pending 비대상 (등록 시 BE default true 적용).
  const handleHeaderActiveChange = useCallback((id: string, isActive: boolean) => {
    if (id.startsWith("new-")) return;
    if (!Number.isFinite(Number(id))) return;
    setHeaderPendingField(id, "isActive", isActive ? "Y" : "N");
  }, [setHeaderPendingField]);

  const handleDetailActiveChange = useCallback((id: string, isActive: boolean) => {
    if (id.startsWith("new-")) return;
    if (!Number.isFinite(Number(id))) return;
    setDetailPendingField(id, "isActive", isActive ? "Y" : "N");
  }, [setDetailPendingField]);

  // 단일 필드 raw 값 → API body 값 변환 (Header/Detail 공용).
  // isActive 는 "Y"/"N" 문자열로 pending 에 저장되므로 boolean 변환.
  const convertHeaderField = (field: string, raw: string): unknown => {
    if (field === "isActive") return raw === "Y";
    if ((HEADER_NUMERIC_FIELDS as readonly string[]).includes(field)) {
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    if ((HEADER_NULLABLE_FIELDS as readonly string[]).includes(field)) {
      return raw || null;
    }
    return raw;
  };
  const convertDetailField = (field: string, raw: string): unknown => {
    if (field === "isActive") return raw === "Y";
    if (field === "sortOrder") return Number(raw) || 0;
    if ((DETAIL_NULLABLE_FIELDS as readonly string[]).includes(field)) return raw || null;
    return raw;
  };

  // 통합 저장 — 신규행 + 편집중 셀 commit + 누적 pending 일괄 저장.
  // 처리 순서:
  //   1) Header/Detail 신규행 등록 (validation → ValidationError)
  //   2) 편집중 셀이 있으면 pending 으로 commit (사용자가 保存 클릭 직전 입력값 누락 방지)
  //   3) Header pending 행별 PUT
  //   4) Detail pending 행별 PUT
  //   5) 모든 단계 성공 시 pending 클리어 + alert
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // 1) 신규행 — Header
      if (headerNewRow) {
        const f = headerNewRowRef.current;
        if (!f.headerCode || !f.headerAlias || !f.headerName) {
          throw new ValidationError("Header Code、Header Id、Header Code Nameは必須です。");
        }
        try {
          await headerCreateMutation.mutateAsync(f);
        } catch (err: unknown) {
          throwWithStage(err, "Header登録");
        }
      }
      // 1) 신규행 — Detail
      if (detailNewRow) {
        const f = detailNewRowRef.current;
        if (!f.code || !f.displayCode || !f.codeName) {
          throw new ValidationError("Code、Display Code、Code Nameは必須です。");
        }
        try {
          await detailCreateMutation.mutateAsync(f);
        } catch (err: unknown) {
          throwWithStage(err, "Detail登録");
        }
      }

      // 2) 편집중 셀 → pending commit (저장 직전 입력값 캡처)
      if (headerEditingCell && !headerEditingCell.rowId.startsWith("new-")) {
        commitHeaderEdit();
      }
      if (editingCell && !editingCell.rowId.startsWith("new-")) {
        commitDetailEdit();
      }

      // 3) Header pending 일괄 저장 — 행별 PUT (필드 변환은 convertHeaderField).
      //    React state 동기 batch 갱신 후 next render 가 아닌 현 호출 시점에서 즉시 사용해야 하므로,
      //    바로 위 commit 직후에 발생할 수 있는 누락분은 ref 에서 직접 한 번 더 추출해 머지한다.
      const headerExtra: Record<string, Record<string, string>> = {};
      if (headerEditingCell && !headerEditingCell.rowId.startsWith("new-")) {
        const v = headerEditRef.current[headerEditingCell.field];
        if (v !== undefined) {
          headerExtra[headerEditingCell.rowId] = { [headerEditingCell.field]: v };
        }
      }
      const headerJobs: Record<string, Record<string, string>> = { ...headerPending };
      for (const [rowId, fields] of Object.entries(headerExtra)) {
        headerJobs[rowId] = { ...headerJobs[rowId], ...fields };
      }
      for (const [rowId, fields] of Object.entries(headerJobs)) {
        const data: Record<string, unknown> = {};
        for (const [field, raw] of Object.entries(fields)) {
          data[field] = convertHeaderField(field, raw);
        }
        if (Object.keys(data).length === 0) continue;
        try {
          await headerUpdateMutation.mutateAsync({ headerId: Number(rowId), data });
        } catch (err: unknown) {
          throwWithStage(err, "Header修正");
        }
      }

      // 4) Detail pending 일괄 저장
      const detailExtra: Record<string, Record<string, string>> = {};
      if (editingCell && !editingCell.rowId.startsWith("new-")) {
        const v = detailEditRef.current[editingCell.field];
        if (v !== undefined) {
          detailExtra[editingCell.rowId] = { [editingCell.field]: v };
        }
      }
      const detailJobs: Record<string, Record<string, string>> = { ...detailPending };
      for (const [rowId, fields] of Object.entries(detailExtra)) {
        detailJobs[rowId] = { ...detailJobs[rowId], ...fields };
      }
      for (const [rowId, fields] of Object.entries(detailJobs)) {
        const data: Record<string, unknown> = {};
        for (const [field, raw] of Object.entries(fields)) {
          data[field] = convertDetailField(field, raw);
        }
        if (Object.keys(data).length === 0) continue;
        try {
          await detailUpdateMutation.mutateAsync({ detailId: Number(rowId), data });
        } catch (err: unknown) {
          throwWithStage(err, "Detail修正");
        }
      }

      // 5) 성공 — pending + 편집 state 정리
      clearHeaderPending();
      clearDetailPending();
      handleHeaderEditCancel();
      handleEditCancel();
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    } catch (err: unknown) {
      // ValidationError는 userMessage를 그대로 표시하고 status 로깅은 skip
      if (err instanceof ValidationError) {
        openAlert({ type: "alert", message: err.userMessage });
        return;
      }
      // PII 로깅 방지 — status + 디버깅 컨텍스트만 기록
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const stage = (err as Error & { _stage?: string })?._stage;
      console.error(
        `[Codes] 저장 실패: stage=${stage ?? "unknown"} status=${status ?? "unknown"} selectedHeaderId=${selectedHeaderId}`,
      );
      openAlert({ type: "alert", message: getApiErrorMessage(err, stage) });
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    headerNewRow,
    headerNewRowRef,
    headerCreateMutation,
    headerEditingCell,
    headerEditRef,
    headerPending,
    headerUpdateMutation,
    handleHeaderEditCancel,
    commitHeaderEdit,
    clearHeaderPending,
    detailNewRow,
    detailNewRowRef,
    detailCreateMutation,
    detailUpdateMutation,
    editingCell,
    detailEditRef,
    detailPending,
    handleEditCancel,
    commitDetailEdit,
    clearDetailPending,
    openAlert,
    selectedHeaderId,
  ]);

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <CodesSearch
        keyword={headers.searchKeyword}
        onKeywordChange={headers.setSearchKeyword}
        onSearch={headers.handleSearch}
        onReset={headers.handleReset}
      />

      <CodesHeaderTable
        rows={headerRows}
        hasNewRow={!!headerNewRow}
        isLoading={headers.headersLoading}
        editingCell={headerEditingCell}
        onAdd={headers.handleHeaderAdd}
        onCancelAdd={headers.handleHeaderCancelAdd}
        onSave={handleSave}
        isSaving={isSaving}
        onHeaderClick={handleHeaderClick}
        onCellEditStart={handleHeaderCellEditStart}
        onEditFieldChange={handleHeaderEditFieldChange}
        onEditCancel={handleHeaderEditCancel}
        onCommitEdit={commitHeaderEdit}
        onNewRowFieldChange={headers.handleHeaderNewRowFieldChange}
        newRowFieldsRef={headers.headerNewRowRef}
        activeOnly={headers.headerActiveOnly}
        onActiveOnlyChange={headers.setHeaderActiveOnly}
        onActiveChange={handleHeaderActiveChange}
        isActiveBusy={isSaving}
      />

      <CodesDetailTable
        rows={detailRows}
        selectedHeaderCode={selectedHeaderCode}
        hasNewRow={!!detailNewRow}
        isLoading={details.detailsLoading}
        editingCell={editingCell}
        onAdd={details.handleDetailAdd}
        onCancelAdd={details.handleDetailCancelAdd}
        onCellEditStart={detailEdit.handleCellEditStart}
        onEditCancel={handleEditCancel}
        onCommitEdit={commitDetailEdit}
        onNewRowFieldChange={details.handleDetailNewRowFieldChange}
        onEditFieldChange={detailEdit.handleEditFieldChange}
        newRowFieldsRef={details.detailNewRowRef}
        activeOnly={details.detailActiveOnly}
        onActiveOnlyChange={details.setDetailActiveOnly}
        onActiveChange={handleDetailActiveChange}
        isActiveBusy={isSaving}
      />
    </main>
  );
}
