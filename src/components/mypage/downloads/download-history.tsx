"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid";
import { MobileCardList } from "@/components/common/mobile-card-list";
import type { MobileCardField } from "@/components/common/mobile-card-list";
import { Button, DatePicker, DimSpinner, InputBox, Pagination, PageSizeSelect } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { usePageSize } from "@/hooks/use-page-size";
import { formatJstDate } from "@/lib/jst-day";

/**
 * DatePicker(Date) → API 파라미터 "YYYY-MM-DD".
 * 브라우저 로컬 TZ 의존을 피하고 JST 일자로 통일 — JST 사용자 환경에선 동일 결과,
 * 다른 TZ 환경에서도 한 칸 어긋남 없이 검색 일자가 화면 표시(formatJstDate)와 일치.
 */
function toDateString(d: Date): string {
  return formatJstDate(d, "-");
}

// Design Ref: §2 — API Response Type
// attachmentId 는 OpenAPI 스펙(nullable: true) · Prisma 스키마(FK SetNull) 와 정합 — 첨부 삭제 후 null.
// null 행에서는 다운로드 버튼을 노출하지 않는다(404 회피).
interface DownloadLogItem {
  id: number;
  downloadedAt: string;
  contentId: number;
  contentTitle: string;
  attachmentId: number | null;
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

/** ISO 시각 문자열 → JST 기준 "YYYY.MM.DD" 표시. jst-day 공용 헬퍼 사용. */
function formatDate(iso: string): string {
  return formatJstDate(iso, ".");
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
  // attachmentId 가 null(첨부 삭제) 인 경우는 다운로드 불가 — 버튼 미노출로 404 회피.
  if (!data || data.isExpired || data.attachmentId == null) return null;

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
  const queryClient = useQueryClient();
  const { openAlert } = useAlertStore();
  const { pageSize, setPageSize } = usePageSize();

  // 검색/페이지네이션 상태
  // 입력값(local)과 실제 검색에 사용되는 값(search) 을 분리 — 사용자가 입력 도중 query 가 매번 발사되지 않도록.
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState<string | null>(null);
  const [searchDateTo, setSearchDateTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // 모바일 누적 로드
  const [mobileItems, setMobileItems] = useState<DownloadLogItem[]>([]);
  const [mobilePage, setMobilePage] = useState(1);
  const [isMobileLoading, setIsMobileLoading] = useState(false);

  // API 연동
  // dateFrom/dateTo 는 백엔드 미구현 상태에서도 future-proof 하게 함께 전송 (서버에서 무시되어도 동작에 영향 없음).
  // refetchOnMount: "always" — 다른 화면(홈/콘텐츠 목록·상세)에서 다운로드 후 이력 페이지로
  // 진입했을 때 글로벌 staleTime(60s) 캐시 hit 으로 인해 신규 행이 즉시 보이지 않는 회귀 차단.
  // 다운로드 발생 시점을 호출지에서 invalidate 하는 방식 대신 진입 시 항상 최신 fetch 로 일원화.
  const { data, isLoading, error } = useQuery<DownloadLogsData>({
    queryKey: ["download-logs", { page, pageSize, keyword: searchKeyword, dateFrom: searchDateFrom, dateTo: searchDateTo }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchDateFrom) params.dateFrom = searchDateFrom;
      if (searchDateTo) params.dateTo = searchDateTo;
      const res = await api.get<{ data: DownloadLogsData }>("/mypage/download-logs", { params });
      return res.data.data;
    },
    refetchOnMount: "always",
  });

  // 모바일 데이터: 첫 페이지는 PC 데이터 사용, 추가 페이지는 별도 fetch로 누적
  // pageSize 셀렉트박스(20/50/100) 가 모바일 누적 단위에도 그대로 반영되도록 PC 와 동일한 pageSize 사용.
  const mobileData = mobilePage === 1
    ? (data?.list.slice(0, pageSize) ?? [])
    : mobileItems;

  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const mobileHasMore = mobilePage * pageSize < totalCount;

  // 검색 실행 — 키워드와 기간 모두 search* 상태로 커밋해 한 번에 query 재발사.
  // 두 날짜 입력은 서로의 선택 가능 범위를 제한하지 않음(사용자가 자유롭게 양방향 수정 가능).
  // 대신 검색 시점에 dateFrom > dateTo 면 알림으로 안내하고 요청 자체를 차단.
  const handleSearch = () => {
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      openAlert({ type: "alert", message: "終了日は開始日以降の日付を指定してください" });
      return;
    }
    setSearchKeyword(keyword);
    setSearchDateFrom(dateFrom ? toDateString(dateFrom) : null);
    setSearchDateTo(dateTo ? toDateString(dateTo) : null);
    setPage(1);
    setMobilePage(1);
    setMobileItems([]);
  };

  // 초기화 — 입력값과 검색값을 모두 비움.
  const handleReset = () => {
    setKeyword("");
    setDateFrom(null);
    setDateTo(null);
    setSearchKeyword("");
    setSearchDateFrom(null);
    setSearchDateTo(null);
    setPage(1);
    setMobilePage(1);
    setMobileItems([]);
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
      const params: Record<string, string | number> = { page: nextPage, pageSize };
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchDateFrom) params.dateFrom = searchDateFrom;
      if (searchDateTo) params.dateTo = searchDateTo;
      const res = await api.get<{ data: DownloadLogsData }>("/mypage/download-logs", { params });
      setMobileItems((prev) => [...(prev.length === 0 ? (data?.list.slice(0, pageSize) ?? []) : prev), ...res.data.data.list]);
      setMobilePage(nextPage);
    } catch (err: unknown) {
      console.error("[DownloadHistory] 추가 로드 실패:", err);
    } finally {
      setIsMobileLoading(false);
    }
  };

  // Design Ref: §3.5 — 다운로드
  const handleDownload = async (item: DownloadLogItem) => {
    // 첨부 삭제(attachmentId=null) 행은 다운로드 불가 — 호출 가드.
    if (item.attachmentId == null) {
      openAlert({ type: "alert", message: "このファイルは既に削除されています。" });
      return;
    }
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
      // 다운로드 로그가 서버에 기록되었으므로 목록 갱신
      await queryClient.invalidateQueries({ queryKey: ["download-logs"] });
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
          {/* attachmentId null(첨부 삭제) 행은 다운로드 버튼 미노출 — PC 셀과 정책 일치. */}
          {!item.isExpired && item.attachmentId != null && (
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

      {/* 검색바 — 관리자 검색 패턴(MembersSearch) 차용. Figma 491:501(PC) / 491:839(MO).
          PC: 라벨박스 + 폼박스 가로 정렬, 한 행 2필드(키워드 + 기간) / MO: 라벨 위 + input 아래, 세로 스택. */}
      <div className="w-full max-w-[1440px] px-[24px] lg:px-0">
        <DownloadHistorySearch
          keyword={keyword}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onKeywordChange={setKeyword}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onSearch={handleSearch}
          onReset={handleReset}
        />
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
            autoHeight={!(!data || data.list.length === 0)}
            maxHeight={!data || data.list.length === 0 ? 200 : undefined}
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

// ─── DownloadHistorySearch ───
// Figma 491:501 (PC) / 491:839 (MO). 관리자 MembersSearch 의 SearchField 구조를 따르되,
// 모바일은 라벨이 input 위로 올라가는 세로 스택으로 분기.
interface DownloadHistorySearchProps {
  keyword: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  onKeywordChange: (value: string) => void;
  onDateFromChange: (date: Date | null) => void;
  onDateToChange: (date: Date | null) => void;
  onSearch: () => void;
  onReset: () => void;
}

function DownloadHistorySearch({
  keyword,
  dateFrom,
  dateTo,
  onKeywordChange,
  onDateFromChange,
  onDateToChange,
  onSearch,
  onReset,
}: DownloadHistorySearchProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) onSearch();
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[28px] lg:pt-[34px] pb-[24px] px-[24px] w-full">
      {/* 필드 행 — MO: column, PC: row */}
      <div className="flex flex-col lg:flex-row gap-[16px] lg:gap-[4px] items-stretch lg:items-start">
        <SearchField label="タイトル·資料名">
          <InputBox
            value={keyword}
            onChange={onKeywordChange}
            onKeyDown={handleKeyDown}
            className="w-full"
          />
        </SearchField>
        <SearchField label="ダウンロード日">
          {/* 기간 입력 — PC: 가로 + "~" / MO: 세로 */}
          <div className="flex flex-col lg:flex-row flex-1 min-w-0 items-stretch lg:items-center gap-[4px] lg:gap-[8px]">
            <div className="flex-1 min-w-0">
              <DatePicker
                value={dateFrom}
                onChange={onDateFromChange}
                dateFormat="yyyy.MM.dd"
                placeholder="YYYY.MM.DD"
              />
            </div>
            <span className="hidden lg:inline shrink-0 font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
              ~
            </span>
            <div className="flex-1 min-w-0">
              <DatePicker
                value={dateTo}
                onChange={onDateToChange}
                dateFormat="yyyy.MM.dd"
                placeholder="YYYY.MM.DD"
              />
            </div>
          </div>
        </SearchField>
      </div>

      {/* 버튼 — PC: 우측 정렬 / MO: 가로 분할(flex-1). */}
      <div className="flex items-center gap-[6px] mt-[18px] lg:justify-end">
        <Button
          variant="secondary"
          onClick={onReset}
          className="flex-1 lg:flex-none"
        >
          初期化
        </Button>
        <Button
          variant="primary"
          onClick={onSearch}
          className="flex-1 lg:flex-none"
        >
          検索
        </Button>
      </div>
    </div>
  );
}

// MO: 라벨이 상단(pb-[8px] pr-[8px]) → input 하단 / PC: 라벨박스 + 폼박스 가로 정렬(SearchField 패턴).
function SearchField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row flex-1 gap-[4px] lg:h-[58px] lg:items-center">
      {/* PC: 라벨 길이에 따라 잘리지 않도록 폭을 160px 로 확장하고 ellipsis 처리 제거. */}
      <div className="flex items-center pb-[8px] pr-[8px] lg:p-0 lg:pl-[16px] lg:pr-[8px] lg:py-[8px] lg:w-[160px] lg:h-full shrink-0 lg:bg-[#f7f9fb] lg:border lg:border-[#eaf0f6] lg:rounded-[6px]">
        <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
          {label}
        </span>
      </div>
      <div className="flex flex-1 min-w-0 items-center lg:bg-white lg:border lg:border-[#eaf0f6] lg:rounded-[6px] lg:p-[8px]">
        {children}
      </div>
    </div>
  );
}
