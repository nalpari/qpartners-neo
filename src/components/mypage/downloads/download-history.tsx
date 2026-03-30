"use client";

import { useState } from "react";
import Image from "next/image";
import type { ColDef } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid";
import { MobileCardList } from "@/components/common/mobile-card-list";
import type { MobileCardField } from "@/components/common/mobile-card-list";
import { Pagination, SelectBox } from "@/components/common";
import { useAlertStore } from "@/lib/store";

/* ─── 타입 & 더미 데이터 ─── */

interface DownloadRecord {
  id: string;
  downloadDate: string;
  title: string;
  fileName: string;
}

const DUMMY_DOWNLOADS: DownloadRecord[] = Array.from({ length: 30 }, (_, i) => ({
  id: `dl-${i + 1}`,
  downloadDate: "2026.03.09",
  title: "Re.RISE-G2 435　※特定プロジェクト限定品",
  fileName: "納入仕様書_Re.RISE-NBC AG270",
}));

const PAGE_SIZE = 10;
const MOBILE_PAGE_SIZE = 5;

/* ─── AG Grid CellRenderer ─── */

function FileNameCell({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-[10px]">
      <Image
        src="/asset/images/contents/pdfIcon.svg"
        alt="PDF"
        width={24}
        height={24}
        className="shrink-0"
      />
      <span className="truncate">{value}</span>
    </div>
  );
}

function DownloadCell() {
  return (
    <button
      type="button"
      onClick={() => useAlertStore.getState().openAlert({ type: "alert", message: "ダウンロード機能は準備中です" })}
      className="bg-[#f7f9fb] rounded-full size-[32px] flex items-center justify-center"
      aria-label="ダウンロード"
    >
      <Image
        src="/asset/images/contents/down_file_icon.svg"
        alt=""
        width={16}
        height={16}
      />
    </button>
  );
}

/* ─── ColDefs ─── */

const columnDefs: ColDef<DownloadRecord>[] = [
  { headerName: "ダウンロード日", field: "downloadDate", width: 140 },
  { headerName: "タイトル", field: "title", flex: 1 },
  {
    headerName: "資料名",
    field: "fileName",
    width: 338,
    cellRendererSelector: () => ({ component: FileNameCell }),
  },
  {
    headerName: "ダウンロード",
    width: 120,
    cellRendererSelector: () => ({ component: DownloadCell }),
    cellStyle: { justifyContent: "center" },
  },
];

/* ─── MobileCardList Fields ─── */

const mobileFields: MobileCardField<DownloadRecord>[] = [
  { label: "ダウンロード日", key: "downloadDate" },
  { label: "タイトル", key: "title" },
  {
    label: "資料名",
    key: "fileName",
    render: (item) => (
      <div className="flex items-center gap-[10px]">
        <div className="flex-1 flex items-start gap-[10px] min-w-0">
          <Image
            src="/asset/images/contents/pdfIcon.svg"
            alt="PDF"
            width={24}
            height={24}
            className="shrink-0"
          />
          <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#555] truncate">
            {item.fileName}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            useAlertStore.getState().openAlert({ type: "alert", message: "ダウンロード機能は準備中です" });
          }}
          className="bg-[#f7f9fb] rounded-full size-[32px] flex items-center justify-center shrink-0"
          aria-label="ダウンロード"
        >
          <Image
            src="/asset/images/contents/down_file_icon.svg"
            alt=""
            width={16}
            height={16}
          />
        </button>
      </div>
    ),
  },
];

/* ─── 메인 컴포넌트 ─── */

export function DownloadHistory() {
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileCount, setMobileCount] = useState(MOBILE_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");

  const totalCount = DUMMY_DOWNLOADS.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const paginatedData = DUMMY_DOWNLOADS.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const mobileData = DUMMY_DOWNLOADS.slice(0, mobileCount);
  const hasMore = mobileCount < totalCount;

  return (
    <section className="flex flex-col gap-[18px] items-center w-full">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-[12px] pb-[4px] w-full max-w-[1440px] px-[24px] lg:px-0 pt-[18px] lg:pt-0">
        <Image
          src="/asset/images/contents/downdata_icon.svg"
          alt=""
          width={42}
          height={42}
          className="hidden lg:block shrink-0"
        />
        <h2 className="flex-1 font-['Noto_Sans_JP'] font-medium text-[18px] leading-[1.5] text-[#101010]">
          ダウンロード履歴
        </h2>
      </div>

      {/* 검색바 */}
      <div className="w-full max-w-[1440px] px-[24px] lg:px-0 flex flex-col gap-[12px] items-center">
        <div className="bg-white rounded-[8px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] h-[60px] flex items-start overflow-hidden pl-[20px] w-full">
          <div className="flex-1 h-[60px] flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="タイトル, 資料名検索"
              className="flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-[14px] leading-[1.5] bg-transparent outline-none text-[#101010] placeholder:text-[#999]"
            />
          </div>
          <button
            type="button"
            className="size-[60px] border-l border-[#f7f9fb] flex items-center justify-center shrink-0"
            aria-label="検索"
          >
            <Image
              src="/asset/images/contents/search_icon.svg"
              alt=""
              width={19}
              height={19}
            />
          </button>
        </div>
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5]">
          <span className="font-medium text-[#e97923]">検索語</span>
          <span className="text-[#101010]">で合</span>
          <span className="font-medium text-[#e97923]">計{totalCount}</span>
          <span className="text-[#101010]">つのデータが検索されました.</span>
        </p>
      </div>

      {/* 테이블 영역 */}
      <div className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] w-full lg:max-w-[1440px] overflow-hidden mt-[6px]">
        {/* 건수 + SelectBox */}
        <div className="flex items-center gap-[14px] px-[24px] pt-[24px] lg:px-[42px] lg:pt-[34px] pb-[18px]">
          <p className="flex-1 font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010] flex-none">
            合計{" "}
            <span className="font-semibold text-[#e97923]">
              {totalCount.toLocaleString()}
            </span>
            件
          </p>
          <div className="w-[100px] ml-auto">
            <SelectBox
              options={[{ value: "100", label: "100" }]}
              value="100"
              className=""
            />
          </div>
        </div>

        {totalCount === 0 ? (
          /* 데이터 없음 */
          <div className="flex items-center justify-center py-[80px] px-[24px] lg:px-[42px]">
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#999] text-center">
              ダウンロードしたデータがありません。
            </p>
          </div>
        ) : (
          <>
            {/* PC: DataGrid + Pagination */}
            <div className="hidden lg:block px-[42px] pb-[42px]">
              <DataGrid columnDefs={columnDefs} rowData={paginatedData} />
              <div className="mt-[24px]">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            </div>
          </>
        )}

        {/* 모바일: MobileCardList + もっと見る */}
        {totalCount > 0 && (
          <div className="lg:hidden bg-[#F7F9FB] pb-[10px] pt-[10px]">
            <MobileCardList
              data={mobileData}
              fields={mobileFields}
              keyExtractor={(item) => item.id}
            />
            {hasMore && (
              <button
                type="button"
                onClick={() =>
                  setMobileCount((prev) => prev + MOBILE_PAGE_SIZE)
                }
                className="flex items-center justify-center gap-[8px] w-full bg-[#45576f] px-[24px] py-[18px] mt-[10px]"
              >
                <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-white">
                  もっと見る
                </span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M6 9L12 15L18 9"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
