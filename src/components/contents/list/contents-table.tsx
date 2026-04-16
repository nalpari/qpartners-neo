"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { formatDate } from "@/lib/format";
import { DataGrid } from "@/components/ag-grid/data-grid";
import {
  Button,
  Spinner,
  Pagination,
  SelectBox,
  MobileCardList,
} from "@/components/common";
import type { MobileCardField } from "@/components/common";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAlertStore } from "@/lib/store";
import type { ContentListItem, CategoryNode } from "./contents-contents";
import { PAGE_SIZE_OPTIONS_FALLBACK } from "@/lib/constants";
import { useCommonCode } from "@/hooks/use-common-code";

/** 콘텐츠 아이템의 카테고리를 부모 코드 기준으로 매칭하여 렌더링 */
function renderCategoryCell(
  item: ContentListItem,
  parentCategoryCode: string,
  inlineStyle?: boolean,
): React.ReactNode {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  if (!matched || matched.children.length === 0) return null;
  const normal = matched.children.filter((c) => !c.isInternalOnly);
  const internal = matched.children.filter((c) => c.isInternalOnly);
  return (
    <span style={inlineStyle ? { fontSize: "12px" } : undefined}>
      {normal.map((c) => c.name).join(", ")}
      {internal.length > 0 && (
        <>
          {normal.length > 0 ? ", " : ""}
          <span style={inlineStyle ? { color: "#FF1A1A" } : undefined} className={inlineStyle ? undefined : "text-[#FF1A1A]"}>
            {internal.map((c) => c.name).join(", ")}
          </span>
        </>
      )}
    </span>
  );
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

/** 컨텐츠 첨부파일 일괄 다운로드 (ZIP) — fetch + blob으로 에러 감지 */
async function downloadAllAttachments(contentId: number): Promise<boolean> {
  try {
    const { default: api } = await import("@/lib/axios");
    const res = await api.get<Blob>(`/contents/${contentId}/files/download-all`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (err: unknown) {
    console.error("[Contents] ZIP 일괄 다운로드 실패:", err);
    return false;
  }
}

function AttachmentCellRenderer(params: ICellRendererParams<ContentListItem>) {
  const { openAlert } = useAlertStore();

  if (!params.data || params.data.attachmentCount === 0) return null;
  const contentId = params.data.id;

  const handleClick = async () => {
    const ok = await downloadAllAttachments(contentId);
    if (!ok) {
      openAlert({ type: "alert", message: "ファイルの一括ダウンロードに失敗しました。" });
    }
  };

  return (
    <div className="flex items-center justify-center w-full">
      <button
        type="button"
        aria-label="添付ファイルダウンロード"
        className="cursor-pointer"
        onClick={() => { void handleClick(); }}
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

function MobileAttachmentButton({ item }: { item: ContentListItem }) {
  if (item.attachmentCount === 0) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void downloadAllAttachments(item.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center px-1 py-[3px] shrink-0 cursor-pointer"
      aria-label="添付ファイルダウンロード"
    >
      <Image
        src="/asset/images/layout/download_icon.svg"
        alt="添付ファイル"
        width={16}
        height={18}
        unoptimized
      />
    </button>
  );
}

/** 게시대상 targetType → 표시명 매핑 */
const TARGET_TYPE_LABELS: Record<string, string> = {
  first_store: "1次販売店",
  second_store: "2次以降の販売店",
  seko: "施工店",
  general: "一般",
  non_member: "非会員",
};

interface ContentsTableProps {
  isInternal?: boolean;
  categories?: CategoryNode[];
  data: ContentListItem[];
  meta?: { total: number; page: number; pageSize: number; totalPages: number };
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function ContentsTable({
  isInternal = false,
  categories = [],
  data,
  meta,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: ContentsTableProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { options: pageSizeOptions } = useCommonCode("PAGE_SIZE", PAGE_SIZE_OPTIONS_FALLBACK);
  const [perPage, setPerPage] = useState("20");

  const totalCount = meta?.total ?? 0;
  const currentPage = meta?.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const handlePerPageChange = (value: string) => {
    setPerPage(value);
    onPageSizeChange(Number(value));
  };

  const columnDefs = useMemo<ColDef<ContentListItem>[]>(() => {
    // 카테고리 그룹 컬럼: parent.name → 헤더, children.name → 셀 (사내 전용 적색)
    const categoryColumns: ColDef<ContentListItem>[] = categories.map((parent) => ({
      headerName: parent.name,
      cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
        if (!params.data) return null;
        return renderCategoryCell(params.data, parent.categoryCode, true);
      },
      flex: 1,
      minWidth: 90,
      headerClass: "ag-header-cell-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    }));

    const baseCols: ColDef<ContentListItem>[] = [
      ...categoryColumns,
      {
        headerName: "タイトル",
        field: "title",
        flex: categoryColumns.length > 0 ? 2 : 3,
        minWidth: 400,
        cellRenderer: TitleCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "添付",
        field: "attachmentCount",
        width: 90,
        cellRenderer: AttachmentCellRenderer,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => formatDate(params.value),
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => params.value ? formatDate(params.value) : "",
      },
    ];

    if (isInternal) {
      baseCols.push(
        {
          headerName: "掲示対象",
          cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
            return (
              <div className="flex flex-col gap-1 pt-3 pb-3 text-center">
                {params.data?.targets.map((t, i) => (
                  <span key={i} className="text-xs">{TARGET_TYPE_LABELS[t.targetType] ?? t.targetType}</span>
                ))}
              </div>
            );
          },
          flex: 1,
          minWidth: 120,
          headerClass: "ag-header-cell-center",
          autoHeight: true,
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        },
        {
          headerName: "担当部門",
          field: "authorDepartment",
          flex: 1,
          minWidth: 110,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
          valueFormatter: (params) => params.value ?? "",
        },
        {
          headerName: "最終確認者",
          field: "approverLevel" as keyof ContentListItem,
          flex: 1,
          minWidth: 110,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
          valueFormatter: () => "",
          // TODO: 공통코드 매핑 필요 — 백엔드에서 approverLevel 목록 API 응답에 추가 후 구현
        },
      );
    }

    return baseCols;
  }, [isInternal, categories]);

  const mobileFields = useMemo<MobileCardField<ContentListItem>[]>(() => {
    const categoryFields: MobileCardField<ContentListItem>[] = categories.map((parent, idx) => ({
      label: parent.name,
      key: "categories" as keyof ContentListItem,
      render: (item: ContentListItem) => renderCategoryCell(item, parent.categoryCode) ?? "",
      ...(idx === 0 ? { action: (item: ContentListItem) => <MobileAttachmentButton item={item} /> } : {}),
    }));

    const base: MobileCardField<ContentListItem>[] = [
      ...categoryFields,
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

    if (isInternal) {
      base.push(
        {
          label: "掲示対象",
          key: "targets" as keyof ContentListItem,
          render: (item) => item.targets.map((t) => TARGET_TYPE_LABELS[t.targetType] ?? t.targetType).join(", "),
        },
        {
          label: "担当部門",
          key: "authorDepartment",
          render: (item) => item.authorDepartment ?? "",
        },
        {
          label: "最終確認者",
          key: "id" as keyof ContentListItem,
          render: () => "", // TODO: 공통코드 매핑
        },
      );
    }

    return base;
  }, [isInternal, categories]);

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
        {isInternal && (
          <Link className="hidden lg:block" href="/contents/create" transitionTypes={["fade"]}>
            <Button variant="primary" className="w-[90px]">
              新規登録
            </Button>
          </Link>
        )}
        <SelectBox
          options={pageSizeOptions}
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

          {data.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
                該当するコンテンツがありません。
              </p>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {/* 모바일 */}
      {isMobile && (
        <div className="flex lg:hidden flex-col w-full">
          <div className="bg-white p-6">
            {topBar}
          </div>
          <div className="block lg:hidden h-[10px] bg-[#F5F5F5]" />
          {data.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px] bg-white">
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
                該当するコンテンツがありません。
              </p>
            </div>
          ) : (
            <MobileCardList<ContentListItem>
              data={data}
              fields={mobileFields}
              keyExtractor={(item) => String(item.id)}
              onItemClick={handleMobileItemClick}
            />
          )}

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
