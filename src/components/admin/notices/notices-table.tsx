"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
} from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, Button, Checkbox } from "@/components/common";
import { usePopupStore, useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import { canModifyClient } from "@/lib/auth-client";
import api from "@/lib/axios";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import type {
  NoticeListItem,
  NoticeListResponse,
  NoticeSearchFilters,
  NoticeFormData,
} from "./notices-types";
import {
  STATUS_LABEL_MAP,
  targetsToLabel,
  formatDate,
} from "./notices-types";

// Design Ref: §4.3 — NoticesTable useQuery + AG Grid 컬럼 매핑

const PAGE_SIZE = 20;


interface NoticeDetailResponse {
  data: {
    id: number;
    targets: string[];
    content: string;
    url: string | null;
    startAt: string;
    endAt: string;
    status: string;
    userType: string;
    userId: string;
    authorIsSuperAdmin?: boolean;
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
  };
}

interface NoticesTableProps {
  filters: NoticeSearchFilters;
  page: number;
  onPageChange: (page: number) => void;
}

export function NoticesTable({ filters, page, onPageChange }: NoticesTableProps) {
  const { openPopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // 로그인 사용자 — TanStack Query 캐시 구독 (layout Gnb 가 /auth/login-user-info 로 주입).
  // canModifyClient 권한 판정에 사용 — user 변경 시 renderer 가 재생성돼 클로저가 최신 사용자 참조.
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  const { data, isLoading } = useQuery<NoticeListResponse>({
    queryKey: [
      "home-notices",
      filters.keyword,
      filters.statuses,
      filters.targetType,
      filters.author,
      filters.startDate?.getTime(),
      filters.endDate?.getTime(),
      page,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(PAGE_SIZE),
      };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.statuses.length > 0) params.status = filters.statuses.join(",");
      if (filters.targetType) params.targetType = filters.targetType;
      if (filters.author) params.createdBy = filters.author;
      if (filters.startDate) {
        const d = filters.startDate;
        params.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      if (filters.endDate) {
        const d = filters.endDate;
        params.endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }

      const res = await api.get<NoticeListResponse>("/home-notices", { params });
      return res.data;
    },
  });

  const items = useMemo(() => data?.data ?? [], [data]);
  const totalPages = data?.meta.totalPages ?? 1;

  // 일괄 삭제 선택 ID 집합. 페이지/필터 변경 시에도 유지(전역). bulk-delete 성공 시 초기화.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => items.map((it) => it.id), [items]);
  // 헤더 체크박스 3상태 — 권한 팝업 패턴과 동일 (none/some/all).
  // some 일 때 indeterminate(회색 가로선) 으로 부분 선택 시각화.
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;

  const toggleOne = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          for (const id of visibleIds) next.add(id);
        } else {
          for (const id of visibleIds) next.delete(id);
        }
        return next;
      });
    },
    [visibleIds],
  );

  // AG Grid api ref — selectedIds 변경 시 _select 컬럼 셀 재렌더 강제. AG Grid 셀 렌더러는
  // context 가 바뀌어도 자동 재호출되지 않아, refreshCells 로 명시적으로 트리거해야 체크 표시가 갱신됨.
  const gridApiRef = useRef<GridApi<NoticeListItem> | null>(null);

  const handleGridReady = useCallback((event: GridReadyEvent<NoticeListItem>) => {
    gridApiRef.current = event.api;
  }, []);

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    // 헤더는 separate refresh 호출 필요 — refreshHeader 로 select 컬럼 헤더 체크박스 갱신.
    api.refreshCells({ columns: ["_select"], force: true });
    api.refreshHeader();
  }, [selectedIds]);

  // 일괄 삭제 mutation — confirm 후에만 호출. 단건 삭제와 권한 모델 동일.
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await api.post("/home-notices/bulk-delete", { ids });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      setSelectedIds(new Set());
      openAlert({ type: "alert", message: "削除しました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 403) {
          openAlert({
            type: "alert",
            message: "選択したお知らせの中に削除する権限がないものが含まれています。",
            confirmLabel: "確認",
          });
          return;
        }
        if (status === 404) {
          openAlert({
            type: "alert",
            message: "選択したお知らせの一部が見つかりません。再読み込みしてください。",
            confirmLabel: "確認",
          });
          return;
        }
      }
      openAlert({ type: "alert", message: "一括削除に失敗しました。", confirmLabel: "確認" });
    },
  });

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) {
      openAlert({
        type: "alert",
        message: "削除するお知らせを選択してください。",
        confirmLabel: "確認",
      });
      return;
    }
    openAlert({
      type: "confirm",
      message: "本当に削除してもよろしいですか？",
      confirmLabel: "削除",
      cancelLabel: "キャンセル",
      onConfirm: () => bulkDeleteMutation.mutate(Array.from(selectedIds)),
    });
  };

  // user·openPopup 을 클로저로 바인딩한 renderer — useMemo 로 reference 안정화 (user 변경 시 재생성)
  const ContentCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<NoticeListItem>) => {
      const rowData = params.data;
      if (!rowData) return null;

      const handleClick = async () => {
        try {
          const res = await api.get<NoticeDetailResponse>(`/home-notices/${rowData.id}`);
          const d = res.data.data;

          // 권한 체크: SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
          if (!canModifyClient(user, d)) {
            useAlertStore.getState().openAlert({
              type: "alert",
              message: "このお知らせを編集する権限がありません。",
            });
            return;
          }

          const formData: NoticeFormData = {
            id: d.id,
            targets: d.targets,
            startDate: d.startAt,
            endDate: d.endAt,
            content: d.content,
            url: d.url ?? "",
            author: d.createdBy ?? "",
            authorId: d.userId,
            createdAt: d.createdAt,
            updater: d.updatedBy ?? "",
            updaterId: "",
            updatedAt: d.updatedAt,
          };
          openPopup("notice-form", { mode: "edit", notice: formData });
        } catch (error: unknown) {
          console.error("[NoticesTable] 공지 상세 조회 실패:", error);
          useAlertStore.getState().openAlert({ type: "alert", message: "データの取得に失敗しました。" });
        }
      };

      return (
        <button
          type="button"
          className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer"
          onClick={handleClick}
        >
          {rowData.content}
        </button>
      );
    };
    return Renderer;
  }, [user, openPopup]);

  // 체크박스 cell renderer — context 로 selectedIds 와 토글 핸들러 전달.
  // selectedIds 가 바뀔 때마다 useEffect 가 refreshCells 를 호출해 강제 재렌더.
  const CheckboxCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<NoticeListItem>) => {
      const rowData = params.data;
      if (!rowData) return null;
      const ctx = params.context as {
        selectedIds: Set<number>;
        toggleOne: (id: number, checked: boolean) => void;
      };
      return (
        <div className="flex items-center justify-center w-full h-full">
          <Checkbox
            checked={ctx.selectedIds.has(rowData.id)}
            onChange={(checked) => ctx.toggleOne(rowData.id, checked)}
          />
        </div>
      );
    };
    return Renderer;
  }, []);

  // 헤더 체크박스 — visibleIds 일괄 토글. AG Grid headerComponent 로 마운트.
  // 권한 팝업과 동일한 3상태 — none/some(indeterminate)/all.
  // refreshHeader 호출로 매번 새 props 가 전달돼 상태가 즉시 반영됨.
  const HeaderCheckbox = useMemo(() => {
    return function HeaderCheckboxRenderer() {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <Checkbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected}
            onChange={toggleAllVisible}
          />
        </div>
      );
    };
  }, [allVisibleSelected, someVisibleSelected, toggleAllVisible]);

  const handleRegister = () => {
    const emptyForm: NoticeFormData = {
      targets: [],
      startDate: "",
      endDate: "",
      content: "",
      url: "",
      author: "",
      authorId: "",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      updater: "",
      updaterId: "",
      updatedAt: "",
    };
    openPopup("notice-form", { mode: "create", notice: emptyForm });
  };

  const columnDefs = useMemo<ColDef<NoticeListItem>[]>(
    () => [
      {
        headerName: "",
        colId: "_select",
        width: 56,
        minWidth: 56,
        maxWidth: 56,
        suppressMovable: true,
        resizable: false,
        sortable: false,
        filter: false,
        headerComponent: HeaderCheckbox,
        cellRenderer: CheckboxCellRenderer,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "掲示対象",
        field: "targets",
        flex: 1,
        valueFormatter: (p) => targetsToLabel(p.value as string[]),
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "お知らせ内容",
        field: "content",
        flex: 2,
        cellRenderer: ContentCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "掲示期間",
        flex: 1.2,
        valueGetter: (p) =>
          `${formatDate(p.data?.startAt)} ~ ${formatDate(p.data?.endAt)}`,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "お知らせ状態",
        field: "status",
        flex: 0.8,
        valueFormatter: (p) => STATUS_LABEL_MAP[p.value as string] ?? (p.value as string),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 0.8,
        valueFormatter: (p) => formatDate(p.value as string),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録者",
        field: "createdBy",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 0.8,
        valueFormatter: (p) => formatDate(p.value as string),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "更新者",
        field: "updatedBy",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
    ],
    [ContentCellRenderer, CheckboxCellRenderer, HeaderCheckbox],
  );

  // 그리드 context — cell renderer 가 최신 selectedIds / 토글 핸들러를 참조하도록 매 렌더 갱신.
  const gridContext = useMemo(
    () => ({ selectedIds, toggleOne }),
    [selectedIds, toggleOne],
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 — 좌측: 선택 정보, 우측: 削除 + 登録 */}
      <div className="flex items-center justify-between">
        <div className="font-['Noto_Sans_JP'] text-[13px] text-[#6a88a9] min-h-[20px]">
          {selectedIds.size > 0 ? `${selectedIds.size}件選択中` : ""}
        </div>
        <div className="flex items-center gap-[8px]">
          <Button
            variant="secondary"
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
          >
            {bulkDeleteMutation.isPending ? "削除中..." : "削除"}
          </Button>
          <Button variant="primary" onClick={handleRegister}>
            お知らせ登録
          </Button>
        </div>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<NoticeListItem>
          columnDefs={columnDefs}
          rowData={items}
          loading={isLoading}
          context={gridContext}
          onGridReady={handleGridReady}
        />
        {totalPages > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
