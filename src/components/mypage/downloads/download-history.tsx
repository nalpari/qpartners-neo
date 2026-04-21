"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid";
import { MobileCardList } from "@/components/common/mobile-card-list";
import type { MobileCardField } from "@/components/common/mobile-card-list";
import { DimSpinner, Pagination, PageSizeSelect } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { usePageSize } from "@/hooks/use-page-size";

// Design Ref: §2 — API Response Type
interface DownloadLogItem {
  id: number;
  downloadedAt: string;
  contentId: number;
  contentTitle: string;
  attachmentId: number;
  fileName: string;
  isExpired: boolean;
}

interface DownloadLogsData {
  totalCount: number;
  page: number;
  pageSize: number;
  keyword: string | null;
  list: DownloadLogItem[];
}

const MOBILE_PAGE_SIZE = 5;

function formatDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}

// Design Ref: §4 — AG Grid CellRenderers
function FileNameCell(params: ICellRendererParams<DownloadLogItem>) {
  const data = params.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-[10px]">
      <Image
        src="/asset/images/contents/pdfIcon.svg"
        alt="PDF"
        width={24}
        height={24}
        className="shrink-0"
      />
      <span className={data.isExpired ? "line-through text-[#999] truncate" : "truncate"}>
        {data.fileName}
      </span>
    </div>
  );
}

function DownloadCell(params: ICellRendererParams<DownloadLogItem>) {
  const data = params.data;
  if (!data || data.isExpired) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const ctx = params.context;
        if (ctx && typeof ctx === "object" && "onDownload" in ctx && typeof ctx.onDownload === "function") {
          (ctx.onDownload as (item: DownloadLogItem) => void)(data);
        }
      }}
      className="bg-[#f7f9fb] rounded-full size-[32px] flex items-center justify-center cursor-pointer hover:bg-[#eaf0f6] transition-colors"
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

// Design Ref: §3 — 메인 컴포넌트
export function DownloadHistory() {
  const { openAlert } = useAlertStore();
  const { pageSize, setPageSize } = usePageSize();

  // 검색/페이지네이션 상태
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [page, setPage] = useState(1);

  // 모바일 누적 로드
  const [mobileItems, setMobileItems] = useState<DownloadLogItem[]>([]);
  const [mobilePage, setMobilePage] = useState(1);
  const [isMobileLoading, setIsMobileLoading] = useState(false);

  // API 연동
  const { data, isLoading, error } = useQuery<DownloadLogsData>({
    queryKey: ["download-logs", { page, pageSize, keyword: searchKeyword }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (searchKeyword) params.keyword = searchKeyword;
      const res = await api.get<{ data: DownloadLogsData }>("/mypage/download-logs", { params });
      return res.data.data;
    },
  });

  // 모바일 데이터: 첫 페이지는 PC 데이터 사용, 추가 페이지는 별도 fetch로 누적
  const mobileData = mobilePage === 1
    ? (data?.list.slice(0, MOBILE_PAGE_SIZE) ?? [])
    : mobileItems;

  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const mobileHasMore = mobilePage * MOBILE_PAGE_SIZE < totalCount;

  // 검색 실행
  const handleSearch = () => {
    setSearchKeyword(keyword);
    setPage(1);
    setMobilePage(1);
    setMobileItems([]);
  };

  const handleSearchClear = () => {
    setKeyword("");
    setSearchKeyword("");
    setPage(1);
    setMobilePage(1);
    setMobileItems([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // 페이지 변경
  const handlePageChange = (p: number) => setPage(p);

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
    setMobilePage(1);
    setMobileItems([]);
  };

  // 모바일 もっと見る
  const handleLoadMore = async () => {
    if (isMobileLoading) return;
    const nextPage = mobilePage + 1;
    setIsMobileLoading(true);
    try {
      const params: Record<string, string | number> = { page: nextPage, pageSize: MOBILE_PAGE_SIZE };
      if (searchKeyword) params.keyword = searchKeyword;
      const res = await api.get<{ data: DownloadLogsData }>("/mypage/download-logs", { params });
      setMobileItems((prev) => [...(prev.length === 0 ? (data?.list.slice(0, MOBILE_PAGE_SIZE) ?? []) : prev), ...res.data.data.list]);
      setMobilePage(nextPage);
    } catch (err: unknown) {
      console.error("[DownloadHistory] 추가 로드 실패:", err);
    } finally {
      setIsMobileLoading(false);
    }
  };

  // Design Ref: §3.5 — 다운로드
  const handleDownload = async (item: DownloadLogItem) => {
    try {
      const res = await api.get<Blob>(
        `/contents/${item.contentId}/files/${item.attachmentId}/download`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("[DownloadHistory] 다운로드 실패:", err);
      openAlert({ type: "alert", message: "ファイルのダウンロードに失敗しました。" });
    }
  };

  // AG Grid ColDefs
  const columnDefs = useMemo<ColDef<DownloadLogItem>[]>(() => [
    {
      headerName: "ダウンロード日",
      field: "downloadedAt",
      width: 140,
      valueFormatter: (p) => p.value ? formatDate(p.value) : "",
    },
    { headerName: "タイトル", field: "contentTitle", flex: 1 },
    {
      headerName: "資料名",
      field: "fileName",
      width: 338,
      cellRenderer: FileNameCell,
    },
    {
      headerName: "ダウンロード",
      width: 120,
      cellRenderer: DownloadCell,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    },
  ], []);

  // 모바일 필드
  const mobileFields: MobileCardField<DownloadLogItem>[] = [
    {
      label: "ダウンロード日",
      key: "downloadedAt",
      render: (item) => item.downloadedAt ? formatDate(item.downloadedAt) : "",
    },
    { label: "タイトル", key: "contentTitle" },
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
            <span className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] truncate ${
              item.isExpired ? "line-through text-[#999]" : "text-[#555]"
            }`}>
              {item.fileName}
            </span>
          </div>
          {!item.isExpired && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(item);
              }}
              className="bg-[#f7f9fb] rounded-full size-[32px] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#eaf0f6] transition-colors"
              aria-label="ダウンロード"
            >
              <Image
                src="/asset/images/contents/down_file_icon.svg"
                alt=""
                width={16}
                height={16}
              />
            </button>
          )}
        </div>
      ),
    },
  ];

  // 로딩
  if (isLoading) {
    return <DimSpinner />;
  }

  // 에러
  if (error) {
    const status = isAxiosError(error) ? error.response?.status : null;
    const message = status === 401 || status === 403
      ? "認証が必要です。再ログインしてください。"
      : "データの読み込みに失敗しました。";

    return (
      <section className="flex items-center justify-center min-h-[300px]">
        <p className="font-['Noto_Sans_JP'] text-[16px] text-[#505050]">{message}</p>
      </section>
    );
  }

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
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="タイトル, 資料名検索"
              className="flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-[14px] leading-[1.5] bg-transparent outline-none text-[#101010] placeholder:text-[#999]"
            />
          </div>
          {keyword && (
            <button
              type="button"
              className="size-[60px] flex items-center justify-center shrink-0"
              onClick={handleSearchClear}
              aria-label="検索クリア"
            >
              <Image
                src="/asset/images/layout/search_delete.svg"
                alt=""
                width={60}
                height={60}
                unoptimized
              />
            </button>
          )}
          <button
            type="button"
            className="size-[60px] border-l border-[#f7f9fb] flex items-center justify-center shrink-0 cursor-pointer"
            onClick={handleSearch}
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
        {searchKeyword && (
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5]">
            「<span className="font-medium text-[#e97923]">{searchKeyword}</span>」
            <span className="text-[#101010]">で合計</span>
            <span className="font-medium text-[#e97923]">{totalCount.toLocaleString()}</span>
            <span className="text-[#101010]">件のデータが検索されました。</span>
          </p>
        )}
      </div>

      {/* 테이블 영역 */}
      <div className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] w-full lg:max-w-[1440px] overflow-hidden mt-[6px]">
        {/* 건수 + SelectBox */}
        <div className="flex items-center gap-[14px] px-[24px] pt-[24px] lg:px-[42px] lg:pt-[34px] pb-[18px]">
          <p className="flex-1 font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010]">
            合計{" "}
            <span className="font-semibold text-[#e97923]">
              {totalCount.toLocaleString()}
            </span>
            件
          </p>
          <PageSizeSelect
            value={pageSize}
            onChange={handlePageSizeChange}
            className="ml-auto"
          />
        </div>

        {/* PC: DataGrid + Pagination */}
        <div className="hidden lg:block px-[42px] pb-[42px]">
          <DataGrid
            columnDefs={columnDefs}
            rowData={data?.list ?? []}
            maxHeight={500}
            context={{ onDownload: (item: DownloadLogItem) => { void handleDownload(item); } }}
            emptyMessage="ダウンロードしたデータがありません。"
          />
          {totalPages > 0 && (
            <div className="mt-[24px]">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </div>

        {/* 모바일: MobileCardList + もっと見る */}
        <div className="lg:hidden bg-[#F7F9FB] pb-[10px] pt-[10px]">
          {totalCount > 0 ? (
            <>
              <MobileCardList
                data={mobileData}
                fields={mobileFields}
                keyExtractor={(item) => String(item.id)}
              />
              {mobileHasMore && (
                <button
                  type="button"
                  onClick={() => { void handleLoadMore(); }}
                  disabled={isMobileLoading}
                  className="flex items-center justify-center gap-[8px] w-full bg-[#45576f] px-[24px] py-[18px] mt-[10px] disabled:opacity-50"
                >
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-white">
                    {isMobileLoading ? "読み込み中..." : "もっと見る"}
                  </span>
                  {!isMobileLoading && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 9L12 15L18 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-[80px] px-[24px] bg-white">
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#999] text-center">
                ダウンロードしたデータがありません。
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
