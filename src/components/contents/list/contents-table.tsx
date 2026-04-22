"use client";

import { useMemo } from "react";
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
  PageSizeSelect,
  MobileCardList,
} from "@/components/common";
import type { MobileCardField } from "@/components/common";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAlertStore } from "@/lib/store";
import type { ContentListItem, CategoryNode } from "./contents-contents";
import { usePageSize } from "@/hooks/use-page-size";
import { useApprover } from "@/hooks/use-approver";

/** 콘텐츠 아이템의 카테고리를 부모 코드 기준으로 매칭하여 렌더링 (빈값 시 "-") */
function renderCategoryCell(
  item: ContentListItem,
  parentCategoryCode: string,
  inlineStyle?: boolean,
): React.ReactNode {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  if (!matched || matched.children.length === 0) {
    return <span style={inlineStyle ? { fontSize: "12px" } : undefined}>-</span>;
  }
  const normal = matched.children.filter((c) => !c.isInternalOnly);
  const internal = matched.children.filter((c) => c.isInternalOnly);
  if (normal.length === 0 && internal.length === 0) {
    return <span style={inlineStyle ? { fontSize: "12px" } : undefined}>-</span>;
  }
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

/** 빈값 정규화 — null/undefined/공백문자열 → "-" */
function orDash(v: unknown): string {
  if (v == null) return "-";
  const s = String(v);
  return s.trim() === "" ? "-" : s;
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

/** 게시대상 표시 순서 — 1차 → 2차 → 시공점 → 일반 → 비회원 */
const TARGET_TYPE_ORDER: Record<string, number> = {
  first_store: 1,
  second_store: 2,
  seko: 3,
  general: 4,
  non_member: 5,
};

/** 고정 순서로 정렬된 targets 반환 (원본 불변) */
function sortTargets<T extends { targetType: string }>(targets: readonly T[]): T[] {
  return [...targets].sort(
    (a, b) =>
      (TARGET_TYPE_ORDER[a.targetType] ?? 99) -
      (TARGET_TYPE_ORDER[b.targetType] ?? 99),
  );
}

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
  const { pageSize: perPage, setPageSize: setPerPage } = usePageSize();
  const { labelMap: approverLabelMap } = useApprover();

  const totalCount = meta?.total ?? 0;
  const currentPage = meta?.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;

  const handlePerPageChange = (value: number) => {
    setPerPage(value);
    onPageSizeChange(value);
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
        valueFormatter: (params) => params.value ? formatDate(params.value) : "-",
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        // 최초 등록(updatedAt === createdAt) 시 미표시 ("-") — 실제 갱신 이력이 있을 때만 렌더
        valueFormatter: (params) => {
          const row = params.data;
          if (!params.value || !row) return "-";
          if (new Date(params.value).getTime() === new Date(row.createdAt).getTime()) return "-";
          return formatDate(params.value);
        },
      },
    ];

    if (isInternal) {
      baseCols.push(
        {
          headerName: "掲示対象",
          cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
            const targets = sortTargets(params.data?.targets ?? []);
            if (targets.length === 0) return <span>-</span>;
            return (
              <div className="flex flex-col gap-1 pt-3 pb-3 text-center">
                {targets.map((t, i) => (
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
          valueFormatter: (params) => orDash(params.value),
        },
        {
          headerName: "最終確認者",
          field: "approverLevel",
          flex: 1,
          minWidth: 110,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
          // APPROVER 공통코드 → 표시 라벨. 미매핑 level 은 "Lv.N" 폴백, null 은 "-"
          valueFormatter: (params) => {
            const lv = params.value;
            if (lv == null) return "-";
            return approverLabelMap[lv] ?? `Lv.${lv}`;
          },
        },
      );
    }

    return baseCols;
  }, [isInternal, categories, approverLabelMap]);

  const mobileFields = useMemo<MobileCardField<ContentListItem>[]>(() => {
    const categoryFields: MobileCardField<ContentListItem>[] = categories.map((parent, idx) => ({
      label: parent.name,
      key: "categories" as keyof ContentListItem,
      render: (item: ContentListItem) => renderCategoryCell(item, parent.categoryCode),
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
        render: (item) => item.createdAt ? formatDate(item.createdAt) : "-",
      },
      {
        label: "更新日",
        key: "updatedAt",
        // 최초 등록(updatedAt === createdAt) 시 미표시 ("-") — 모바일 카드도 동일 규칙
        render: (item) => {
          if (!item.updatedAt) return "-";
          if (new Date(item.updatedAt).getTime() === new Date(item.createdAt).getTime()) return "-";
          return formatDate(item.updatedAt);
        },
      },
    ];

    if (isInternal) {
      base.push(
        {
          label: "掲示対象",
          key: "targets" as keyof ContentListItem,
          render: (item) => {
            const sorted = sortTargets(item.targets);
            if (sorted.length === 0) return "-";
            return sorted.map((t) => TARGET_TYPE_LABELS[t.targetType] ?? t.targetType).join(", ");
          },
        },
        {
          label: "担当部門",
          key: "authorDepartment",
          render: (item) => orDash(item.authorDepartment),
        },
        {
          label: "最終確認者",
          key: "approverLevel",
          render: (item) => {
            const lv = item.approverLevel;
            if (lv == null) return "-";
            return approverLabelMap[lv] ?? `Lv.${lv}`;
          },
        },
      );
    }

    return base;
  }, [isInternal, categories, approverLabelMap]);

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
        <PageSizeSelect value={perPage} onChange={handlePerPageChange} />
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
              emptyMessage="該当するコンテンツがありません。"
            />
            {totalPages > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
              />
            )}
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
