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

// pending 변경값을 row 위에 overlay — 셀 표시·재진입 편집 시 default 값이 pending 으로 노출.
// 문자열 필드는 그대로, sortOrder 는 number, isActive 는 "Y"|"N" 로 타입 변환.
//
// 모듈 스코프 정의 — 매 렌더 함수 identity 안정화 + React Compiler 메모이제이션 명시화.
function applyHeaderPending(row: HeaderGridRow, pending: Record<string, string>): HeaderGridRow {
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
}

function applyDetailPending(row: DetailGridRow, pending: Record<string, string>): DetailGridRow {
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
}

// 단일 필드 raw 값 → API body 값 변환 (Header/Detail 분리).
// isActive 는 "Y"/"N" 문자열로 pending 에 저장되므로 boolean 변환.
function convertHeaderField(field: string, raw: string): unknown {
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
}

/**
 * convertDetailField — sortOrder 변환은 잘못된 입력(빈 문자열·NaN·음수)을 0 으로
 * 강제하던 패턴(`Number(raw) || 0`)이 BE 클램프와 결합해 의도치 않은 sortOrder=1
 * 강제 이동을 유발하던 버그를 차단한다 (PR #132 리뷰).
 *
 * 유효하지 않은 sortOrder 입력은 `undefined` 반환 → 호출측이 data 객체에 포함하지
 * 않아 BE 가 해당 필드를 미수정 처리.
 */
function convertDetailField(field: string, raw: string): unknown {
  if (field === "isActive") return raw === "Y";
  if (field === "sortOrder") {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
    return n;
  }
  if ((DETAIL_NULLABLE_FIELDS as readonly string[]).includes(field)) return raw || null;
  return raw;
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
    detailsRaw,
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
    discardRowPending: discardDetailRowPending,
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
    discardRowPending: discardHeaderRowPending,
  } = headerEdit;

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
    ...detailsRaw.map((d) => {
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
      // 0) Detail Sort Order 중복 검증 — 같은 Header 내 Detail 들 사이에서 충돌 금지.
      //    이전엔 BE 가 자동 shift 했지만, 사용자 의도와 다른 결과(다른 행이 밀림) 회피를
      //    위해 클라이언트에서 명시적으로 차단한다.
      //    검증 대상: 기존 detailsRaw 에 신규행/수정행을 적용한 최종 (rowId → sortOrder) 맵.
      {
        const finalSorts = new Map<string, number>();
        for (const d of detailsRaw) {
          finalSorts.set(String(d.id), d.sortOrder);
        }
        if (detailNewRow) {
          const ns = Number(detailNewRowRef.current.sortOrder);
          if (Number.isFinite(ns) && Number.isInteger(ns) && ns > 0) {
            finalSorts.set(String(detailNewRow.id), ns);
          }
        }
        // 편집 중 셀(ref) + pending 머지 — 아직 PUT 전이지만 사용자가 변경 의도한 최종 값
        const tempJobs: Record<string, Record<string, string>> = { ...detailPending };
        if (editingCell && !editingCell.rowId.startsWith("new-")) {
          const v = detailEditRef.current[editingCell.field];
          if (v !== undefined) {
            tempJobs[editingCell.rowId] = {
              ...tempJobs[editingCell.rowId],
              [editingCell.field]: v,
            };
          }
        }
        for (const [rowId, fields] of Object.entries(tempJobs)) {
          if (fields.sortOrder === undefined) continue;
          const n = Number(fields.sortOrder);
          if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
            finalSorts.set(rowId, n);
          }
        }
        const occurrences = new Map<number, number>();
        for (const sort of finalSorts.values()) {
          occurrences.set(sort, (occurrences.get(sort) ?? 0) + 1);
        }
        const duplicates = Array.from(occurrences.entries())
          .filter(([, count]) => count > 1)
          .map(([sort]) => sort)
          .sort((a, b) => a - b);
        if (duplicates.length > 0) {
          throw new ValidationError(
            `Sort Order が重複しています (${duplicates.join(", ")})。他の値を入力してください。`,
          );
        }
      }

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

      // 2) 편집중 셀의 마지막 입력값은 ref 에서 직접 캡처 (아래 extra 머지).
      //    여기서 commitHeaderEdit/commitDetailEdit 을 호출하면 ref 가 비워져
      //    extra 가 항상 빈 값이 되므로 마지막 셀 저장이 누락됨 (이전 패치 회귀 방지).
      //    ref/editingCell 정리는 성공 분기의 handleHeaderEditCancel/handleEditCancel 가 담당.

      // 3) Header pending 일괄 저장 — 행별 PUT (필드 변환은 convertHeaderField).
      //    closure 의 headerPending 은 이전 셀 전환 시 commitEdit 으로 누적된 분만 포함하므로,
      //    현재 편집중인 셀의 입력값은 ref 에서 직접 추출해 머지한다.
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
          const converted = convertHeaderField(field, raw);
          // undefined 는 변환 실패(현재 Header 분기 없음, 향후 확장 대비) → 미수정 의미로 제외.
          if (converted === undefined) continue;
          data[field] = converted;
        }
        if (Object.keys(data).length === 0) continue;
        try {
          await headerUpdateMutation.mutateAsync({ headerId: Number(rowId), data });
        } catch (err: unknown) {
          throwWithStage(err, "Header修正");
        }
        // 부분 실패 회피 — 행 PUT 성공 시 즉시 해당 행 pending 제거.
        // catch 블록까지 도달했다면 throwWithStage 가 throw 했으므로 여기엔 도달 안 함.
        // 신규행 prefix(`new-`)는 setPendingField 단계에서 차단되어 jobs 에 들어오지 않음.
        if (!rowId.startsWith("new-")) {
          discardHeaderRowPending(rowId);
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
          const converted = convertDetailField(field, raw);
          // undefined → 잘못된 sortOrder 입력 등. data 에 포함하지 않아 BE 가 미수정 처리.
          if (converted === undefined) continue;
          data[field] = converted;
        }
        if (Object.keys(data).length === 0) continue;
        try {
          await detailUpdateMutation.mutateAsync({ detailId: Number(rowId), data });
        } catch (err: unknown) {
          throwWithStage(err, "Detail修正");
        }
        // 부분 실패 회피 — 행 PUT 성공 시 즉시 해당 행 pending 제거.
        if (!rowId.startsWith("new-")) {
          discardDetailRowPending(rowId);
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
    clearHeaderPending,
    discardHeaderRowPending,
    detailsRaw,
    detailNewRow,
    detailNewRowRef,
    detailCreateMutation,
    detailUpdateMutation,
    editingCell,
    detailEditRef,
    detailPending,
    handleEditCancel,
    clearDetailPending,
    discardDetailRowPending,
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
