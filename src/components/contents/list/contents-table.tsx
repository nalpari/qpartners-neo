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
  Pagination,
  PageSizeSelect,
  MobileCardList,
} from "@/components/common";
import type { MobileCardField } from "@/components/common";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { MENU } from "@/lib/menu-codes";
import type { ContentListItem, CategoryNode } from "./contents-contents";
import { useApprover } from "@/hooks/use-approver";
import { useTargetLabels } from "@/hooks/use-target-labels";
import { parseContentDispositionFilename } from "@/lib/content-disposition";

/** 콘텐츠 아이템의 카테고리를 부모 코드 기준으로 매칭하여 렌더링 (빈값 시 "-")
 * 비사내 사용자(`isInternal = false`)에게는 사내전용 카테고리 라벨을 숨긴다.
 * Issue: #2160 — 비회원 화면에서 사내전용 카테고리 라벨이 노출되던 문제 차단.
 */
function renderCategoryCell(
  item: ContentListItem,
  parentCategoryCode: string,
  inlineStyle: boolean,
  isInternal: boolean,
): React.ReactNode {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  if (!matched || matched.children.length === 0) {
    return <span style={inlineStyle ? { fontSize: "12px" } : undefined}>-</span>;
  }
  const normal = matched.children.filter((c) => !c.isInternalOnly);
  const internal = isInternal ? matched.children.filter((c) => c.isInternalOnly) : [];
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
        className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] whitespace-nowrap underline cursor-pointer"
      >
        {data.title}
      </Link>
      {data.isNew && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2] whitespace-nowrap">
          NEW
        </span>
      )}
      {data.hasBeenUpdated && data.isUpdated && (
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
    // blob URL 다운로드 시 a.download 가 비어 있으면 브라우저가 Content-Disposition 을
    // 무시하고 blob URL 의 마지막 segment(UUID) 를 파일명으로 사용한다.
    // 서버 응답 헤더(`{title}_{YYYYMMDD}.zip` 또는 단일 파일 원본명) 를 파싱해 명시한다.
    const dispo =
      typeof res.headers["content-disposition"] === "string"
        ? res.headers["content-disposition"]
        : null;
    const fileName = parseContentDispositionFilename(dispo) ?? "download.zip";
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
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
      {(item.isNew || (item.hasBeenUpdated && item.isUpdated)) && (
        <div className="flex items-center gap-1">
          {item.isNew && (
            <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#F4F9FD] border border-[#E3EFFB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#63A5F2]">
              NEW
            </span>
          )}
          {item.hasBeenUpdated && item.isUpdated && (
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

// 게시대상 라벨/순서 — useTargetLabels 훅으로 통합. 정적 fallback 은 훅 내부에서 처리.

interface ContentsTableProps {
  isInternal?: boolean;
  categories?: CategoryNode[];
  data: ContentListItem[];
  meta?: { total: number; page: number; pageSize: number; totalPages: number };
  isLoading: boolean;
  /** 부모(ContentsContents) 의 usePageSize 단일 출처 — URL 미영속이라 새로고침 시 sort=1 복귀. */
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function ContentsTable({
  isInternal = false,
  categories = [],
  data,
  meta,
  isLoading,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ContentsTableProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  // APPROVER 공통코드는 사내 사용자에게만 최종확인자 컬럼 표시 — 비사내 fetch 생략
  const { labelMap: approverLabelMap, isLoading: isLoadingApprover } = useApprover({
    enabled: isInternal,
  });
  // CONTENT.canCreate 매트릭스 가드 — 관리자가 권한관리 UI 에서 토글한 결과를 등록 버튼에 즉시 반영.
  // 서버 POST /api/contents 도 requireMenuPermission(CONTENT, create) 로 최종 검증하므로 FE 는 UX 전용.
  // 로딩 중 fail-closed (isPermLoading 시 false) — RBAC 표준 패턴 B 준수.
  const { canCreate: canCreateContent, isLoading: isPermLoading } = useMenuPermission(MENU.CONTENT);
  // 매트릭스가 유일한 권한 판단 기준 — isInternal 이중 가드 제거.
  const showCreateButton = !isPermLoading && canCreateContent;

  // 권한관리 라벨 동기화 — 게시대상 셀/CSV export 표시명을 권한명으로 동적 변환.
  // 비활성된 권한도 표시는 유지(기존 콘텐츠 호환). 옵션 노출 필터는 검색/등록 컴포넌트에서만 적용.
  const { resolveLabel: resolveTargetLabel, sortByOrder: sortTargets } = useTargetLabels();

  // 행 데이터에 정렬된 targets 를 미리 계산 (cellRenderer 매 호출마다 sort 비용 회피)
  const rowData = useMemo<ContentListItem[]>(
    () => data.map((item) => ({ ...item, targets: sortTargets(item.targets) })),
    [data, sortTargets],
  );

  const totalCount = meta?.total ?? 0;
  const currentPage = meta?.page ?? 1;
  const totalPages = meta?.totalPages ?? 1;


  const columnDefs = useMemo<ColDef<ContentListItem>[]>(() => {
    // 카테고리 그룹 컬럼: parent.name → 헤더, children.name → 셀 (사내 전용 적색)
    const categoryColumns: ColDef<ContentListItem>[] = categories.map((parent) => ({
      headerName: parent.name,
      cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
        if (!params.data) return null;
        return renderCategoryCell(params.data, parent.categoryCode, true, isInternal);
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
        // 서버 hasBeenUpdated 단일 출처 — 최초 등록 시 "-", 갱신 이력 있으면 날짜
        valueFormatter: (params) => {
          const row = params.data;
          if (!row || !row.hasBeenUpdated || !params.value) return "-";
          return formatDate(params.value);
        },
      },
    ];

    if (isInternal) {
      baseCols.push(
        {
          headerName: "掲示対象",
          cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
            // rowData 에서 이미 정렬된 targets 를 사용 (cellRenderer sort 비용 회피)
            const targets = params.data?.targets ?? [];
            if (targets.length === 0) return <span>-</span>;
            return (
              <div className="flex flex-col gap-1 pt-3 pb-3 text-center">
                {targets.map((t, i) => (
                  <span key={i} className="text-xs">{resolveTargetLabel(t.roleCode)}</span>
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
          // APPROVER 공통코드 → 표시 라벨. 조회 중엔 "…", 미매핑 level 은 "Lv.N" 폴백, null 은 "-"
          valueFormatter: (params) => {
            const lv = params.value;
            if (lv == null) return "-";
            if (isLoadingApprover) return "…";
            return approverLabelMap[lv] ?? `Lv.${lv}`;
          },
        },
      );
    }

    return baseCols;
  }, [isInternal, categories, approverLabelMap, isLoadingApprover, resolveTargetLabel]);

  const mobileFields = useMemo<MobileCardField<ContentListItem>[]>(() => {
    // 모바일 목록은 카테고리 항목 비노출 — 사용자 요청에 따라 컴팩트 카드로 운영.
    // 첨부 다운로드 버튼(MobileAttachmentButton)은 기존 첫 행(첫 카테고리)에 부여돼 있었으므로
    // 카테고리 제거 후에는 첫 표시 필드인 タイトル 행으로 옮긴다.
    const base: MobileCardField<ContentListItem>[] = [
      {
        label: "タイトル",
        key: "title",
        render: renderMobileTitle,
        action: (item) => <MobileAttachmentButton item={item} />,
      },
      {
        label: "登録日",
        key: "createdAt",
        render: (item) => item.createdAt ? formatDate(item.createdAt) : "-",
      },
      {
        label: "更新日",
        key: "updatedAt",
        // 서버 hasBeenUpdated 단일 출처
        render: (item) => {
          if (!item.hasBeenUpdated || !item.updatedAt) return "-";
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
            // rowData 에서 이미 정렬된 targets 사용
            if (item.targets.length === 0) return "-";
            return item.targets.map((t) => resolveTargetLabel(t.roleCode)).join(", ");
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
            if (isLoadingApprover) return "…";
            return approverLabelMap[lv] ?? `Lv.${lv}`;
          },
        },
      );
    }

    return base;
  }, [isInternal, approverLabelMap, isLoadingApprover, resolveTargetLabel]);

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
        {showCreateButton && (
          <Link className="hidden lg:block" href="/contents/create" transitionTypes={["fade"]}>
            <Button variant="primary" className="w-[90px]">
              新規登録
            </Button>
          </Link>
        )}
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>
    </div>
  );

  return (
    <>
      {/* 데스크톱 */}
      {!isMobile && (
        <div className="hidden lg:flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
          {topBar}

          <div className="flex flex-col gap-6">
            <DataGrid<ContentListItem>
              columnDefs={columnDefs}
              rowData={rowData}
              className="contents-grid"
              loading={isLoading}
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
              data={rowData}
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
