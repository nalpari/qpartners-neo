"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, SelectBox, Checkbox, Button } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { DUMMY_BULK_MAILS } from "./bulk-mail-dummy-data";
import type { BulkMailItem } from "./bulk-mail-dummy-data";

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function TitleCellRenderer(params: ICellRendererParams<BulkMailItem>) {
  const data = params.data;
  if (!data) return null;

  return (
    <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer">
      {data.title}
    </span>
  );
}

function AttachmentCellRenderer(params: ICellRendererParams<BulkMailItem>) {
  if (!params.data?.hasAttachment) return null;
  return (
    <div className="flex items-center justify-center w-full">
      <Image
        src="/asset/images/layout/download_icon.svg"
        alt=""
        width={16}
        height={18}
        unoptimized
      />
    </div>
  );
}

export function BulkMailTable() {
  const { openAlert } = useAlertStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState("100");
  const [draftOnly, setDraftOnly] = useState(false);

  const filteredData = draftOnly
    ? DUMMY_BULK_MAILS.filter((m) => m.status === "下書き")
    : DUMMY_BULK_MAILS;

  const totalCount = filteredData.length;
  const totalPages = Math.ceil(totalCount / Number(perPage));

  const handleSendMail = () => {
    openAlert({
      type: "alert",
      message: "メール発送画面は準備中です。",
      confirmLabel: "確認",
    });
  };

  const columnDefs = useMemo<ColDef<BulkMailItem>[]>(
    () => [
      {
        headerName: "配信日",
        field: "sentAt",
        flex: 1,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => params.value || "—",
      },
      {
        headerName: "配信状態",
        field: "status",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "配信対象",
        field: "target",
        flex: 0.8,
        cellStyle: centerCellStyle,
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
        headerName: "添付ファイル",
        field: "hasAttachment",
        flex: 0.6,
        cellRenderer: AttachmentCellRenderer,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録者名",
        field: "authorName",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録者ID",
        field: "authorId",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 필터 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
            送信メール一覧{" "}
            <span className="font-semibold text-[#E97923]">
              ({totalCount.toLocaleString()}件)
            </span>
          </p>
          <Checkbox
            checked={draftOnly}
            onChange={setDraftOnly}
            label="下書き保存メールのみ表示"
          />
        </div>
        <div className="flex items-center gap-[6px]">
          <Button variant="primary" onClick={handleSendMail}>
            メール発送
          </Button>
          <div className="w-[100px]">
            <SelectBox
              options={PER_PAGE_OPTIONS}
              value={perPage}
              onChange={setPerPage}
            />
          </div>
        </div>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<BulkMailItem>
          columnDefs={columnDefs}
          rowData={filteredData}
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
