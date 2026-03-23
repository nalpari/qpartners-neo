"use client";

import { Activity, useMemo, useState } from "react";
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
import { useIsMobile } from "@/hooks/use-media-query";
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

/** 모바일 카드에서 타이틀 + 배지 렌더링 */
function renderMobileTitle(item: ContentItem) {
  const showNew = isNew(item.createdAt);
  const showUpdate = isUpdated(item.updatedAt);

  return (
    <div className="flex flex-col gap-2">
      {(showNew || showUpdate) && (
        <div className="flex items-center gap-1">
          {showNew && (
            <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2]">
              NEW
            </span>
          )}
          {showUpdate && (
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

/** 모바일 카드에서 첨부파일 아이콘 */
function renderAttachmentAction(item: ContentItem) {
  if (!item.hasAttachment) return null;
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
}

export function ContentsTable({ isAdmin = false }: ContentsTableProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
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
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        headerClass: "ag-header-cell-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 1,
        headerClass: "ag-header-cell-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
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
          cellStyle: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
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
          cellStyle: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }
      );
    }

    return baseCols;
  }, [isAdmin]);

  /** 모바일 카드 필드 정의 */
  const mobileFields = useMemo<MobileCardField<ContentItem>[]>(() => {
    const base: MobileCardField<ContentItem>[] = [
      {
        label: "情報タイプ",
        key: "infoType",
        action: renderAttachmentAction,
      },
      { label: "対象", key: "target" },
      {
        label: "タイトル",
        key: "title",
        render: renderMobileTitle,
      },
      { label: "登録日", key: "createdAt" },
      {
        label: "更新日",
        key: "updatedAt",
        render: (item) => item.updatedAt ?? "",
      },
    ];

    if (isAdmin) {
      base.push(
        { label: "投稿対象", key: "postTarget" },
        { label: "担当部門", key: "department" },
        { label: "最終確認者", key: "approver" }
      );
    }

    return base;
  }, [isAdmin]);

  const handleMobileItemClick = (item: ContentItem) => {
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
  );

  return (
    <>
      {/* 데스크톱: 상단바 + 테이블 + 페이지네이션을 하나의 카드로 */}
      <Activity mode={isMobile ? "hidden" : "visible"}>
        <div className="hidden lg:flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
          {topBar}
          
          <div className="flex flex-col gap-6">
            <DataGrid<ContentItem>
              columnDefs={columnDefs}
              rowData={DUMMY_CONTENTS}
              className="contents-grid"
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </Activity>

      {/* 모바일: 상단바 별도 섹션 + 카드 리스트 */}
      <Activity mode={isMobile ? "visible" : "hidden"}>
        <div className="flex lg:hidden flex-col w-full">
          {/* 모바일 상단바 */}
          <div className="bg-white p-6">
            {topBar}
          </div>
          <div className="block lg:hidden h-[10px] bg-[#F5F5F5]"></div>
          {/* 카드 리스트 */}
          <MobileCardList<ContentItem>
            data={DUMMY_CONTENTS}
            fields={mobileFields}
            keyExtractor={(item) => item.id}
            onItemClick={handleMobileItemClick}
          />

          {/* 더보기 버튼 */}
          <button
            type="button"
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
        </div>
      </Activity>
    </>
  );
}
