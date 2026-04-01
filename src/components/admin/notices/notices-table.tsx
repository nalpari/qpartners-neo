"use client";

import { useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, Button } from "@/components/common";
import { usePopupStore } from "@/lib/store";
import { DUMMY_NOTICES, toFormData, EMPTY_NOTICE_FORM } from "./notices-dummy-data";
import type { NoticeItem } from "./notices-dummy-data";

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function ContentCellRenderer(params: ICellRendererParams<NoticeItem>) {
  const data = params.data;
  if (!data) return null;

  const openPopup = usePopupStore.getState().openPopup;

  return (
    <button
      type="button"
      className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer"
      onClick={() => openPopup("notice-form", { mode: "edit", notice: toFormData(data) })}
    >
      {data.content}
    </button>
  );
}

export function NoticesTable() {
  const { openPopup } = usePopupStore();
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 100;

  const totalCount = DUMMY_NOTICES.length;
  const totalPages = Math.ceil(totalCount / perPage);

  const handleRegister = () => {
    openPopup("notice-form", { mode: "create", notice: EMPTY_NOTICE_FORM });
  };

  const columnDefs = useMemo<ColDef<NoticeItem>[]>(
    () => [
      {
        headerName: "掲示対象",
        field: "target",
        flex: 1,
        cellStyle: centerCellStyle,
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
        field: "period",
        flex: 1.2,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "お知らせ状態",
        field: "status",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録者",
        field: "author",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "更新者",
        field: "updater",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
    ],
    []
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
        <DataGrid<NoticeItem>
          columnDefs={columnDefs}
          rowData={DUMMY_NOTICES}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
