"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Pagination, SelectBox } from "@/components/common";
import { DUMMY_CONTENTS, isNew, isUpdated } from "./contents-dummy-data";
import type { ContentItem } from "./contents-dummy-data";

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

function TitleCellRenderer(params: ICellRendererParams<ContentItem>) {
  const data = params.data;
  if (!data) return null;
  const showNew = isNew(data.createdAt);
  const showUpdate = isUpdated(data.updatedAt);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/contents/${data.id}`}
        transitionTypes={["fade"]}
        className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#555] whitespace-nowrap hover:underline"
      >
        {data.title}
      </Link>
      {showNew && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2] whitespace-nowrap">
          NEW
        </span>
      )}
      {showUpdate && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#FFF3F8] border border-[#F8E3EB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#BC6E8D] whitespace-nowrap">
          UPDATE
        </span>
      )}
    </div>
  );
}

function AttachmentCellRenderer(params: ICellRendererParams<ContentItem>) {
  if (!params.data?.hasAttachment) return null;
  return (
    <div className="flex items-center justify-center w-full">
      <button type="button" aria-label="添付ファイルダウンロード" className="cursor-pointer">
        <Image
          src="/asset/images/layout/download_icon.svg"
          alt=""
          width={16}
          height={18}
          unoptimized
        />
      </button>
    </div>
  );
}

interface ContentsTableProps {
  isAdmin?: boolean;
}

export function ContentsTable({ isAdmin = false }: ContentsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState("100");

  const totalCount = DUMMY_CONTENTS.length;
  const totalPages = Math.ceil(totalCount / Number(perPage));

  const columnDefs = useMemo<ColDef<ContentItem>[]>(() => {
    const baseCols: ColDef<ContentItem>[] = [
      {
        headerName: "情報タイプ",
        field: "infoType",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "対象",
        field: "target",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "タイトル",
        field: "title",
        width: 498,
        cellRenderer: TitleCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "添付ファイル",
        field: "hasAttachment",
        flex: 1,
        cellRenderer: AttachmentCellRenderer,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 1,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => params.value ?? "",
      },
    ];

    if (isAdmin) {
      baseCols.push(
        {
          headerName: "投稿対象",
          field: "postTarget",
          width: 136,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        },
        {
          headerName: "担当部門",
          field: "department",
          flex: 1,
          headerClass: "ag-header-cell-center",
        },
        {
          headerName: "最終確認者",
          field: "approver",
          flex: 1,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        }
      );
    }

    return baseCols;
  }, [isAdmin]);

  return (
    <div className="flex flex-col gap-6 bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단: 결과 수 + 버튼 */}
      <div className="flex items-center justify-between">
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
          合計{" "}
          <span className="font-semibold text-[#E97923]">
            {totalCount.toLocaleString()}
          </span>
          件
        </p>
        <div className="flex items-center gap-[6px]">
          {isAdmin && (
            <Link href="/contents/create" transitionTypes={["fade"]} className="hidden lg:block">
              <Button variant="primary" className="w-[110px]">
                お知らせ登録
              </Button>
            </Link>
          )}
          <SelectBox
            options={PER_PAGE_OPTIONS}
            value={perPage}
            onChange={setPerPage}
            className="w-[80px]"
          />
        </div>
      </div>

      {/* AG Grid */}
      <DataGrid<ContentItem>
        columnDefs={columnDefs}
        rowData={DUMMY_CONTENTS}
        className="contents-grid"
      />

      {/* 페이지네이션 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
