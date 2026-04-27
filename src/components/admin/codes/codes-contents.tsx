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
import { useCellEdit } from "./hooks/use-cell-edit";

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
    handleEditCancel,
    handleRequestEditCancel,
  } = detailEdit;
  const {
    editingCell: headerEditingCell,
    detailEditRef: headerEditRef,
    handleCellEditStart: handleHeaderCellEditStart,
    handleEditCancel: handleHeaderEditCancel,
    handleEditFieldChange: handleHeaderEditFieldChange,
  } = headerEdit;

  // Grid 표시용 데이터 (spread로 immutable 처리, editingField 주입)
  const headerRows: HeaderGridRow[] = [
    ...(headerNewRow ? [headerNewRow] : []),
    ...headers.headersRaw.map((h) => {
      const row = toHeaderGridRow(h);
      if (headerEditingCell && row.id === headerEditingCell.rowId) {
        return { ...row, editingField: headerEditingCell.field };
      }
      return row;
    }),
  ];

  const detailRows: DetailGridRow[] = [
    ...(detailNewRow ? [detailNewRow] : []),
    ...details.detailsRaw.map((d) => {
      const row = toDetailGridRow(d, selectedHeaderCode);
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

  // 통합 저장 — 중복 호출 가드 + validation → ValidationError, API 실패 → _stage 부착 throw
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Header 신규행 저장
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
      // Detail 신규행 저장
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
      // Header 편집행 저장 (modal save 트리거)
      if (headerEditingCell && !headerEditingCell.rowId.startsWith("new-")) {
        const editValues = headerEditRef.current;
        const field = headerEditingCell.field;
        const data: Record<string, unknown> = {};
        if (editValues[field] !== undefined) {
          // 숫자 필드는 nullable 분기보다 먼저 처리 — 빈값·NaN은 null, 유효 숫자는 Number 변환
          if ((HEADER_NUMERIC_FIELDS as readonly string[]).includes(field)) {
            const raw = editValues[field];
            if (raw === "" || raw === undefined) {
              data[field] = null;
            } else {
              const n = Number(raw);
              data[field] = Number.isFinite(n) ? n : null;
            }
          } else if ((HEADER_NULLABLE_FIELDS as readonly string[]).includes(field)) {
            data[field] = editValues[field] || null;
          } else {
            data[field] = editValues[field];
          }
        }
        if (Object.keys(data).length > 0) {
          try {
            await headerUpdateMutation.mutateAsync({
              headerId: Number(headerEditingCell.rowId),
              data,
            });
            handleHeaderEditCancel();
          } catch (err: unknown) {
            throwWithStage(err, "Header修正");
          }
        }
      }
      // Detail 편집행 저장 (NaN 가드)
      if (editingCell && !editingCell.rowId.startsWith("new-")) {
        const editValues = detailEditRef.current;
        const field = editingCell.field;
        const data: Record<string, unknown> = {};
        if (editValues[field] !== undefined) {
          if (field === "sortOrder") data[field] = Number(editValues[field]) || 0;
          else if ((DETAIL_NULLABLE_FIELDS as readonly string[]).includes(field)) data[field] = editValues[field] || null;
          else data[field] = editValues[field];
        }
        if (Object.keys(data).length > 0) {
          try {
            await detailUpdateMutation.mutateAsync({
              detailId: Number(editingCell.rowId),
              data,
            });
            // 성공 시 편집 state 정리 — update mutation의 onSuccess는 query invalidate만 담당
            handleEditCancel();
          } catch (err: unknown) {
            throwWithStage(err, "Detail修正");
          }
        }
      }
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
    headerUpdateMutation,
    handleHeaderEditCancel,
    detailNewRow,
    detailNewRowRef,
    detailCreateMutation,
    detailUpdateMutation,
    editingCell,
    detailEditRef,
    handleEditCancel,
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
        onNewRowFieldChange={headers.handleHeaderNewRowFieldChange}
        newRowFieldsRef={headers.headerNewRowRef}
        activeOnly={headers.headerActiveOnly}
        onActiveOnlyChange={headers.setHeaderActiveOnly}
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
        onSave={handleSave}
        onNewRowFieldChange={details.handleDetailNewRowFieldChange}
        onEditFieldChange={detailEdit.handleEditFieldChange}
        newRowFieldsRef={details.detailNewRowRef}
        activeOnly={details.detailActiveOnly}
        onActiveOnlyChange={details.setDetailActiveOnly}
      />
    </main>
  );
}
