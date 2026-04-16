"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, Button, Spinner } from "@/components/common";
import { usePopupStore, useAlertStore } from "@/lib/store";
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
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
  };
}

function ContentCellRenderer(params: ICellRendererParams<NoticeListItem>) {
  const data = params.data;
  if (!data) return null;

  const openPopup = usePopupStore.getState().openPopup;

  const handleClick = async () => {
    try {
      const res = await api.get<NoticeDetailResponse>(`/home-notices/${data.id}`);
      const d = res.data.data;
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
      {data.content}
    </button>
  );
}

interface NoticesTableProps {
  filters: NoticeSearchFilters;
  page: number;
  onPageChange: (page: number) => void;
}

export function NoticesTable({ filters, page, onPageChange }: NoticesTableProps) {
  const { openPopup } = usePopupStore();

  const { data, isLoading } = useQuery<NoticeListResponse>({
    queryKey: [
      "home-notices",
      filters.keyword,
      filters.statuses,
      filters.targetType,
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

  // Plan SC-07: 등록자 클라이언트 필터링
  const items = data?.data ?? [];
  const filteredItems = filters.author
    ? items.filter((item) => item.createdBy?.includes(filters.author))
    : items;

  const totalPages = data?.meta.totalPages ?? 1;

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
    [],
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 */}
      <div className="flex items-center justify-end">
        <Button variant="primary" onClick={handleRegister}>
          お知らせ登録
        </Button>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Spinner size={48} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
              データがありません
            </p>
          </div>
        ) : (
          <>
            <DataGrid<NoticeListItem>
              columnDefs={columnDefs}
              rowData={filteredItems}
            />
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
