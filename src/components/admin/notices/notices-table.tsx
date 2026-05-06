"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
} from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, PageSizeSelect, Button, Checkbox, PermissionGate } from "@/components/common";
import { usePopupStore, useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import { canModifyClient } from "@/lib/auth-client";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";
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
  formatUserLabel,
} from "./notices-types";

// Design Ref: §4.3 — NoticesTable useQuery + AG Grid 컬럼 매핑


interface NoticeDetailResponse {
  data: {
    id: number;
    targets: string[];
    title: string;
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
    createdByName?: string | null;
    updatedAt: string;
    updatedBy: string | null;
    updatedByName?: string | null;
  };
}

interface NoticesTableProps {
  filters: NoticeSearchFilters;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  // 일괄 삭제 선택 상태는 부모가 보유. 페이지/필터 변경 시 부모가 명시적으로 초기화.
  // (자식 useEffect 로 외부값 변화에 맞춰 setState 하면 React Compiler set-state-in-effect 규칙 위반)
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
}

export function NoticesTable({
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectedIdsChange,
}: NoticesTableProps) {
  const { openPopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // RBAC 표준 패턴 — ADM_NOTICE 매트릭스 가드. 권한관리 UI 토글이 즉시 버튼/액션에 반영됨.
  // 로딩 중 fail-closed (isPermLoading 시 false) — 클릭 race window 차단.
  // 서버 API 도 requireMenuPermission(ADM_NOTICE, ...) 로 최종 검증하므로 FE 는 UX 전용.
  // canCreate 는 「お知らせ登録」 버튼의 PermissionGate 가 자체 조회하므로 분해 불요.
  const {
    canUpdate: canUpdateNotice,
    canDelete: canDeleteNotice,
    isLoading: isPermLoading,
  } = useMenuPermission(ADMIN_MENU.NOTICES);

  // 로그인 사용자 — TanStack Query 캐시 구독 (layout Gnb 가 /auth/login-user-info 로 주입).
  // canModifyClient 권한 판정에 사용 — user 변경 시 renderer 가 재생성돼 클로저가 최신 사용자 참조.
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  const { data, isLoading } = useQuery<NoticeListResponse>({
    // 배열을 직접 키에 넣으면 reference identity 가 매 렌더 바뀔 때 캐시 미스 발생.
    // join(",") 으로 직렬화해 동일 내용은 동일 키로 안정화.
    queryKey: [
      "home-notices",
      filters.keyword,
      filters.statuses.join(","),
      filters.targetTypes.join(","),
      filters.author,
      filters.startDate?.getTime(),
      filters.endDate?.getTime(),
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.statuses.length > 0) params.status = filters.statuses.join(",");
      // 게시대상 멀티 선택 — comma-separated 로 BE 에 전달, BE 에서 OR 조건으로 변환.
      if (filters.targetTypes.length > 0) params.targetType = filters.targetTypes.join(",");
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

  const visibleIds = useMemo(() => items.map((it) => it.id), [items]);
  // 헤더 체크박스 3상태 — 권한 팝업 패턴과 동일 (none/some/all).
  // some 일 때 indeterminate(회색 가로선) 으로 부분 선택 시각화.
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;

  const toggleOne = useCallback(
    (id: number, checked: boolean) => {
      const next = new Set(selectedIds);
      if (checked) next.add(id);
      else next.delete(id);
      onSelectedIdsChange(next);
    },
    [selectedIds, onSelectedIdsChange],
  );

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      const next = new Set(selectedIds);
      if (checked) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      onSelectedIdsChange(next);
    },
    [selectedIds, visibleIds, onSelectedIdsChange],
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
      onSelectedIdsChange(new Set());
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

  // 공통 클릭 핸들러 — 상세 조회 → 권한 체크 → 팝업 오픈.
  // 타이틀/내용 두 컬럼 모두 동일 동작을 공유하도록 useCallback 으로 추출.
  const openNoticeDetail = useCallback(
    async (id: number) => {
      try {
        const res = await api.get<NoticeDetailResponse>(`/home-notices/${id}`);
        const d = res.data.data;

        // 작성자 가드(canModifyClient) AND 매트릭스 가드(canUpdate) — 둘 다 통과해야 편집 진입.
        // 패턴 E (클릭 시점 alert) — 행 클릭이 라우트 이동 대신 모달 오픈이라 추가 안전장치.
        if (!canModifyClient(user, d) || isPermLoading || !canUpdateNotice) {
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
          title: d.title,
          content: d.content,
          url: d.url ?? "",
          // 팝업 표시는 "이름(ID)" 형식 — author/updater 가 이름, authorId/updaterId 가 ID.
          // 이름 미해결 시 author=빈문자열, ID 만 표시.
          author: d.createdByName ?? "",
          authorId: d.createdBy ?? d.userId,
          createdAt: d.createdAt,
          // updatedBy 가 null 이면 갱신 이력 없음으로 갱신자/갱신일 모두 비운다 (Redmine #2175).
          // Prisma @updatedAt 이 INSERT 시 createdAt 과 동일 시각으로 채워지는 부수 효과 차단 —
          // applyNoticeMeta · 목록 컬럼과 동일한 가드를 단건 상세 진입 경로에도 적용.
          updater: d.updatedBy ? (d.updatedByName ?? "") : "",
          updaterId: d.updatedBy ?? "",
          updatedAt: d.updatedBy ? d.updatedAt : "",
        };
        openPopup("notice-form", { mode: "edit", notice: formData });
      } catch (error: unknown) {
        console.error("[NoticesTable] 공지 상세 조회 실패:", error);
        useAlertStore.getState().openAlert({ type: "alert", message: "データの取得に失敗しました。" });
      }
    },
    [user, openPopup, isPermLoading, canUpdateNotice],
  );

  // 제목 셀 — 클릭 시 상세 팝업 오픈. Issue #2148 — 표시값을 content → title 로 변경.
  const TitleCellRenderer = useMemo(() => {
    const Renderer = (params: ICellRendererParams<NoticeListItem>) => {
      const rowData = params.data;
      if (!rowData) return null;
      return (
        <button
          type="button"
          className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer text-left"
          onClick={() => openNoticeDetail(rowData.id)}
        >
          {rowData.title}
        </button>
      );
    };
    return Renderer;
  }, [openNoticeDetail]);

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
    // Issue #2146 (2) — createdAt 을 미리 채우지 않는다. 폼 표시값이 실제 DB 저장 시각과 어긋나는 문제
    // 차단. 신규 등록 모달에서 등록일은 "—" 로 표시되고, 저장 응답 후 실제 createdAt 으로 갱신된다.
    const emptyForm: NoticeFormData = {
      targets: [],
      startDate: "",
      endDate: "",
      title: "",
      content: "",
      url: "",
      author: "",
      authorId: "",
      createdAt: "",
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
        headerName: "タイトル",
        field: "title",
        flex: 2,
        cellRenderer: TitleCellRenderer,
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
        // "이름(ID)" 형식 — 이름 미해결 시 ID 만 표시 (formatUserLabel 폴백).
        headerName: "登録者",
        flex: 1,
        valueGetter: (p) => formatUserLabel(p.data?.createdByName, p.data?.createdBy),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        // updatedBy 가 null 이면 갱신 이력 없음으로 갱신일도 비운다 (Redmine #2175).
        // Prisma @updatedAt 이 INSERT 시 createdAt 과 동일 시각으로 채워지는 부수 효과 차단.
        headerName: "更新日",
        flex: 0.8,
        valueGetter: (p) => (p.data?.updatedBy ? p.data.updatedAt : ""),
        valueFormatter: (p) => (p.value ? formatDate(p.value as string) : "-"),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        // "이름(ID)" 형식 — 이름 미해결 시 ID 만 표시. updatedBy 미존재 시 "-" 폴백.
        headerName: "更新者",
        flex: 1,
        valueGetter: (p) => formatUserLabel(p.data?.updatedByName, p.data?.updatedBy),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
    ],
    [TitleCellRenderer, CheckboxCellRenderer, HeaderCheckbox],
  );

  // 그리드 context — cell renderer 가 최신 selectedIds / 토글 핸들러를 참조하도록 매 렌더 갱신.
  const gridContext = useMemo(
    () => ({ selectedIds, toggleOne }),
    [selectedIds, toggleOne],
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 — 좌측: 선택 정보, 우측: 削除 + 登録 + 表示件数(맨 우측) */}
      <div className="flex items-center justify-between">
        <div className="font-['Noto_Sans_JP'] text-[13px] text-[#6a88a9] min-h-[20px]">
          {selectedIds.size > 0 ? `${selectedIds.size}件選択中` : ""}
        </div>
        <div className="flex items-center gap-[8px]">
          {/* 일괄삭제 — 패턴 B (canDelete=false 시 disabled) */}
          <Button
            variant="secondary"
            onClick={handleBulkDelete}
            disabled={isPermLoading || !canDeleteNotice || bulkDeleteMutation.isPending}
          >
            {bulkDeleteMutation.isPending ? "削除中..." : "削除"}
          </Button>
          {/* 등록 — 패턴 A (PermissionGate 로 canCreate=false 시 버튼 자체 숨김) */}
          <PermissionGate menuCode={ADMIN_MENU.NOTICES} action="create" fallback={null}>
            <Button variant="primary" onClick={handleRegister}>
              お知らせ登録
            </Button>
          </PermissionGate>
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
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
