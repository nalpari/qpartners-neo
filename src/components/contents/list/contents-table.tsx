"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import {
  Button,
  Pagination,
  SelectBox,
  MobileCardList,
} from "@/components/common";
import type { MobileCardField } from "@/components/common";
import { Spinner } from "@/components/common/spinner";
import { useIsMobile } from "@/hooks/use-media-query";
import type { ContentListItem, CodeDetail } from "./contents-contents";

const DEFAULT_PAGE_SIZE_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

function formatDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function TitleCellRenderer(params: ICellRendererParams<ContentListItem>) {
  const data = params.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/contents/${data.id}`}
        transitionTypes={["fade"]}
        className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#555] whitespace-nowrap hover:underline"
      >
        {data.title}
      </Link>
      {data.isNew && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2] whitespace-nowrap">
          NEW
        </span>
      )}
      {data.isUpdated && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#FFF3F8] border border-[#F8E3EB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#BC6E8D] whitespace-nowrap">
          UPDATE
        </span>
      )}
    </div>
  );
}

function AttachmentCellRenderer(params: ICellRendererParams<ContentListItem>) {
  if (!params.data || params.data.attachmentCount === 0) return null;
  return (
    <div className="flex items-center justify-center w-full">
      <button
        type="button"
        aria-label="添付ファイルダウンロード"
        className="cursor-pointer"
      >
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

function renderMobileTitle(item: ContentListItem) {
  return (
    <div className="flex flex-col gap-2">
      {(item.isNew || item.isUpdated) && (
        <div className="flex items-center gap-1">
          {item.isNew && (
            <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2]">
              NEW
            </span>
          )}
          {item.isUpdated && (
            <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#FFF3F8] border border-[#F8E3EB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#BC6E8D]">
              UPDATE
            </span>
          )}
        </div>
      )}
      <p className="text-[#555] break-words whitespace-normal">{item.title}</p>
    </div>
  );
}

function renderAttachmentAction(item: ContentListItem) {
  if (item.attachmentCount === 0) return null;
  return (
    <div className="flex items-center px-1 py-[3px] shrink-0">
      <Image
        src="/asset/images/layout/download_icon.svg"
        alt="添付ファイル"
        width={16}
        height={18}
        unoptimized
      />
    </div>
  );
}

interface ContentsTableProps {
  isAdmin?: boolean;
  data: ContentListItem[];
  meta?: { total: number; page: number; pageSize: number; totalPages: number };
  isLoading: boolean;
  pageSizeOptions?: CodeDetail[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function ContentsTable({
  isAdmin = false,
  data,
  meta,
  isLoading,
  pageSizeOptions = [],
  onPageChange,
  onPageSizeChange,
}: ContentsTableProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [perPage, setPerPage] = useState("20");

  const totalCount = meta?.total ?? 0;
  const currentPage = meta?.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const handlePerPageChange = (value: string) => {
    setPerPage(value);
    onPageSizeChange(Number(value));
  };

  // 카테고리를 콤마 구분 텍스트로 표시
  const getCategoryText = (item: ContentListItem) =>
    item.categories.map((c) => c.name).join(", ");

  // 게시대상 텍스트
  const getTargetText = (item: ContentListItem) =>
    item.targets.map((t) => t.targetType).join(", ");

  const columnDefs = useMemo<ColDef<ContentListItem>[]>(() => {
    const baseCols: ColDef<ContentListItem>[] = [
      {
        headerName: "カテゴリ",
        valueGetter: (params) => getCategoryText(params.data!),
        flex: 1.5,
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
        headerName: "添付",
        field: "attachmentCount",
        flex: 0.5,
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
        valueFormatter: (params) => formatDate(params.value),
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 1,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => params.value ? formatDate(params.value) : "",
      },
    ];

    if (isAdmin) {
      baseCols.push(
        {
          headerName: "掲示対象",
          valueGetter: (params) => getTargetText(params.data!),
          width: 136,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        },
        {
          headerName: "担当部門",
          field: "authorDepartment",
          flex: 1,
          headerClass: "ag-header-cell-center",
          valueFormatter: (params) => params.value ?? "",
        },
      );
    }

    return baseCols;
  }, [isAdmin]);

  const mobileFields = useMemo<MobileCardField<ContentListItem>[]>(() => {
    const base: MobileCardField<ContentListItem>[] = [
      {
        label: "カテゴリ",
        key: "categories" as keyof ContentListItem,
        render: (item) => getCategoryText(item),
        action: renderAttachmentAction,
      },
      {
        label: "タイトル",
        key: "title",
        render: renderMobileTitle,
      },
      {
        label: "登録日",
        key: "createdAt",
        render: (item) => formatDate(item.createdAt),
      },
      {
        label: "更新日",
        key: "updatedAt",
        render: (item) => item.updatedAt ? formatDate(item.updatedAt) : "",
      },
    ];

    if (isAdmin) {
      base.push(
        {
          label: "掲示対象",
          key: "targets" as keyof ContentListItem,
          render: (item) => getTargetText(item),
        },
        {
          label: "担当部門",
          key: "authorDepartment",
          render: (item) => item.authorDepartment ?? "",
        },
      );
    }

    return base;
  }, [isAdmin]);

  const handleMobileItemClick = (item: ContentListItem) => {
    router.push(`/contents/${item.id}`, { transitionTypes: ["fade"] });
  };

  const topBar = (
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
          <Link className="hidden lg:block" href="/contents/create" transitionTypes={["fade"]}>
            <Button variant="primary" className="w-[110px]">
              新規登録
            </Button>
          </Link>
        )}
        <SelectBox
          options={
            pageSizeOptions.length > 0
              ? pageSizeOptions.map((o) => ({ value: o.code, label: o.name }))
              : DEFAULT_PAGE_SIZE_OPTIONS
          }
          value={perPage}
          onChange={handlePerPageChange}
          className="w-[80px]"
        />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <>
      {/* 데스크톱 */}
      {!isMobile && (
        <div className="hidden lg:flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
          {topBar}

          <div className="flex flex-col gap-6">
            <DataGrid<ContentListItem>
              columnDefs={columnDefs}
              rowData={data}
              className="contents-grid"
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </div>
        </div>
      )}

      {/* 모바일 */}
      {isMobile && (
        <div className="flex lg:hidden flex-col w-full">
          <div className="bg-white p-6">
            {topBar}
          </div>
          <div className="block lg:hidden h-[10px] bg-[#F5F5F5]" />
          <MobileCardList<ContentListItem>
            data={data}
            fields={mobileFields}
            keyExtractor={(item) => String(item.id)}
            onItemClick={handleMobileItemClick}
          />

          {currentPage < totalPages && (
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              className="flex items-center justify-center gap-2 w-full bg-[#45576F] px-6 py-[18px] cursor-pointer transition-colors duration-150 hover:bg-[#3a4a5d]"
            >
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-white">
                もっと見る
              </span>
              <Image
                src="/asset/images/contents/more_icon.svg"
                alt=""
                width={24}
                height={24}
              />
            </button>
          )}
        </div>
      )}
    </>
  );
}
