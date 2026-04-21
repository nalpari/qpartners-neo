"use client";

// Design Ref: §4.3 — AG Grid + useQuery + 페이지네이션

import { useMemo } from "react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, PageSizeSelect } from "@/components/common";
import { usePopupStore } from "@/lib/store";
import type { MemberListItem, MemberListResponse, MemberSearchFilters } from "./members-types";
import { STATUS_LABEL_MAP, USER_TYPE_REVERSE_MAP, formatDateTime, formatDate } from "./members-types";
import { CENTER_CELL_STYLE } from "@/lib/constants";

function NameCellRenderer(params: ICellRendererParams<MemberListItem>) {
  const data = params.data;
  if (!data) return null;

  const openPopup = usePopupStore.getState().openPopup;

  const userTp = USER_TYPE_REVERSE_MAP[data.userType];

  const handleClick = () => {
    if (!userTp) {
      console.warn("[MembersTable] 매핑 불가 userType:", data.userType);
      return;
    }
    openPopup("member-detail", { userId: data.userId, userTp, listItem: data });
  };

  return (
    <button
      type="button"
      className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] hover:underline cursor-pointer"
      onClick={handleClick}
    >
      {data.userName}
    </button>
  );
}

interface MembersTableProps {
  filters: MemberSearchFilters;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function MembersTable({
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: MembersTableProps) {
  // Design Ref: §4.3 — useQuery
  const { data, isLoading } = useQuery<MemberListResponse["data"]>({
    queryKey: ["admin", "members", filters, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.userType) params.userType = filters.userType;
      if (filters.status) params.status = filters.status;

      const res = await api.get<MemberListResponse>("/admin/members", { params });
      return res.data.data;
    },
    staleTime: Infinity,
  });

  const list = data?.list ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Design Ref: §4.3 — AG Grid 컬럼 (Plan §1.4 필드 매핑)
  const columnDefs = useMemo<ColDef<MemberListItem>[]>(
    () => [
      {
        headerName: "状態",
        field: "status",
        flex: 0.8,
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string>) => {
          const v = p.value ?? "";
          return STATUS_LABEL_MAP[v] ?? v;
        },
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "ID",
        field: "userId",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名",
        field: "userName",
        flex: 1,
        cellRenderer: NameCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名ひらがな",
        field: "userNameKana",
        flex: 1.2,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "Email",
        field: "email",
        flex: 1.5,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "会員タイプ",
        field: "userType",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "最近アクセス日時",
        field: "lastLoginAt",
        flex: 1.2,
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string | null>) =>
          formatDateTime(p.value ?? null),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "会社名",
        field: "companyName",
        flex: 1.2,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string | null>) =>
          formatDate(p.value ?? null),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 */}
      <div className="flex items-center justify-between">
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
          合計{" "}
          <span className="font-semibold text-[#E97923]">
            {totalCount.toLocaleString()}
          </span>
          件
        </p>
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<MemberListItem>
          columnDefs={columnDefs}
          rowData={list}
          getRowId={(p) => p.data.id}
          loading={isLoading}
          emptyMessage="検索結果がありません"
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
