"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import type { ColDef, ICellRendererParams, SortChangedEvent } from "ag-grid-community";
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
import { targetOrderRank } from "@/lib/target-role-order";
import { parseContentDispositionFilename } from "@/lib/content-disposition";

/** 콘텐츠 목록 카테고리 컬럼 우선 노출 순서. 여기에 없는 카테고리는 VIEW 뒤에 기존 sortOrder 순으로 배치. */
const PRIORITY_CATEGORY_ORDER: Record<string, number> = {
  INFO: 1, // 情報種別
  BIZ: 2, // 業務分類
  DATA: 3, // 資料分類
  CONT: 4, // 内容分類
};

/** 掲示対象 컬럼 정렬 식별용 colId — 카테고리(categoryCode)·고정 필드와 겹치지 않는 예약값.
 *  ContentsContents.handleSortChange 가 이 값으로 sortTargets=true 요청을 분기한다. */
export const TARGETS_SORT_COL_ID = "__targets__";

/** 정렬 키 — 콘텐츠당 해당 부모 카테고리의 "표시순 첫 번째" 자식 카테고리명 (없으면 null).
 *  서버(route.ts)의 sortCategoryCode 로직과 동일 기준(children[0])을 사용해야 화면 정렬과
 *  실제 서버 정렬 결과가 어긋나지 않는다. */
function getFirstCategoryChildName(item: ContentListItem, parentCategoryCode: string): string | null {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  return matched?.children[0]?.name ?? null;
}

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

interface DownloadResult {
  ok: boolean;
  /** 실패 시 axios 응답 상태 코드 (네트워크 단절 등 응답 자체가 없으면 undefined) */
  status?: number;
}

/** 컨텐츠 첨부파일 일괄 다운로드 (ZIP) — fetch + blob으로 에러 감지 */
async function downloadAllAttachments(contentId: number): Promise<DownloadResult> {
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
    return { ok: true };
  } catch (err: unknown) {
    console.error("[Contents] ZIP 일괄 다운로드 실패:", err);
    const status = isAxiosError(err) ? err.response?.status : undefined;
    return { ok: false, status };
  }
}

/** status 코드별 안내 메시지 — download-all/route.ts 가 실제로 내려주는 상태코드(403/404/413/500)와 매칭. */
function resolveDownloadErrorMessage(status: number | undefined): string {
  switch (status) {
    case 403:
      return "この操作を行う権限がありません。";
    case 404:
      return "対象が見つかりません。既に削除された可能性があります。";
    case 413:
      return "ファイルサイズが大きすぎてダウンロードできません。";
    default:
      return "ファイルの一括ダウンロードに失敗しました。";
  }
}

function AttachmentCellRenderer(params: ICellRendererParams<ContentListItem>) {
  const { openAlert } = useAlertStore();

  if (!params.data || params.data.attachmentCount === 0) return null;
  const contentId = params.data.id;

  const handleClick = async () => {
    const result = await downloadAllAttachments(contentId);
    if (!result.ok) {
      openAlert({ type: "alert", message: resolveDownloadErrorMessage(result.status) });
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
  const { openAlert } = useAlertStore();

  if (item.attachmentCount === 0) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void (async () => {
      const result = await downloadAllAttachments(item.id);
      if (!result.ok) {
        openAlert({ type: "alert", message: resolveDownloadErrorMessage(result.status) });
      }
    })();
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
  /** 콘텐츠 목록 API 실패 여부 — true 면 "결과 없음"과 구분되는 에러 메시지를 표시한다. */
  isError?: boolean;
  /** 부모(ContentsContents) 의 usePageSize 단일 출처 — URL 미영속이라 새로고침 시 sort=1 복귀. */
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /**
   * ag-grid 헤더 클릭 전체 데이터 정렬 — colId 그대로 전달(field 인지 카테고리 categoryCode 인지는
   * 호출자가 CONTENT_SORT_FIELDS 화이트리스트로 판별). 정렬 해제 시 둘 다 undefined.
   */
  onSortChange: (colId: string | undefined, dir: "asc" | "desc" | undefined) => void;
}

export function ContentsTable({
  isInternal = false,
  categories = [],
  data,
  meta,
  isLoading,
  isError = false,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSortChange,
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
    const toCategoryColumn = (parent: CategoryNode): ColDef<ContentListItem> => ({
      headerName: parent.name,
      colId: parent.categoryCode,
      sortable: true,
      cellDataType: false,
      // ag-grid 는 내림차순일 때 comparator 반환값의 부호를 자동으로 뒤집는다
      // (compareRowNodes: `sort === "asc" ? result : -result`). "-"(매칭 없음) 행은
      // 서버(route.ts sortCategoryCode 로직)와 동일하게 방향과 무관하게 항상 맨 뒤에 와야 하므로,
      // isDescending 일 때 반대 부호를 반환해 grid 의 반전을 미리 상쇄한다.
      comparator: (
        _a: unknown,
        _b: unknown,
        nodeA: { data?: ContentListItem },
        nodeB: { data?: ContentListItem },
        isDescending: boolean,
      ) => {
        const a = nodeA.data ? getFirstCategoryChildName(nodeA.data, parent.categoryCode) : null;
        const b = nodeB.data ? getFirstCategoryChildName(nodeB.data, parent.categoryCode) : null;
        const lastSign = isDescending ? -1 : 1;
        if (a === null && b === null) return 0;
        if (a === null) return lastSign;
        if (b === null) return -lastSign;
        return a.localeCompare(b, "ja");
      },
      cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
        if (!params.data) return null;
        return renderCategoryCell(params.data, parent.categoryCode, true, isInternal);
      },
      flex: 1,
      minWidth: 90,
      headerClass: "ag-header-cell-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    });

    // 우선 노출 카테고리(PRIORITY_CATEGORY_ORDER)는 지정 순서로 更新日과 タイトル 사이에,
    // 그 외 카테고리는 기존 sortOrder 순서 그대로 VIEW 뒤에 배치.
    // isVisible === false 인 parent 는 관리자가 명시적으로 컬럼 미노출로 토글한 상태 → 제외.
    const visibleParents = categories.filter((parent) => parent.isVisible !== false);
    const priorityCategoryColumns = visibleParents
      .filter((parent) => Object.hasOwn(PRIORITY_CATEGORY_ORDER, parent.categoryCode))
      .sort(
        (a, b) =>
          PRIORITY_CATEGORY_ORDER[a.categoryCode] - PRIORITY_CATEGORY_ORDER[b.categoryCode],
      )
      .map(toCategoryColumn);
    const otherCategoryColumns = visibleParents
      .filter((parent) => !Object.hasOwn(PRIORITY_CATEGORY_ORDER, parent.categoryCode))
      .map(toCategoryColumn);
    const hasCategoryColumns = visibleParents.length > 0;

    const baseCols: ColDef<ContentListItem>[] = [
      {
        headerName: "登録日",
        field: "createdAt",
        sortable: true,
        // ag-grid 의 cellDataType 자동추론이 valueFormatter 만 있는(cellRenderer 없는) 컬럼에서
        // 정렬 클릭 자체를 먹통으로 만드는 경우가 있어, 추론을 끄고 comparator 를 직접 지정한다.
        // 실제 정렬은 서버(sortField/sortDir)가 수행 — 여기 comparator 는 클릭 활성화 목적.
        cellDataType: false,
        comparator: (a: string, b: string) => a.localeCompare(b),
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => params.value ? formatDate(params.value) : "-",
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        sortable: true,
        cellDataType: false,
        // 미수정 콘텐츠는 DB 상 updatedAt=createdAt 로 채워져 null 이 아니지만 화면엔 "-"로 표시되므로,
        // 서버(route.ts sortField==="updatedAt" 분기)와 동일하게 방향과 무관하게 항상 뒤로 보낸다.
        // isDescending 상쇄 로직은 카테고리 컬럼 comparator 와 동일한 이유(ag-grid 자동 부호반전).
        comparator: (
          _a: string,
          _b: string,
          nodeA: { data?: ContentListItem },
          nodeB: { data?: ContentListItem },
          isDescending: boolean,
        ) => {
          const a = nodeA.data?.hasBeenUpdated ? nodeA.data.updatedAt : null;
          const b = nodeB.data?.hasBeenUpdated ? nodeB.data.updatedAt : null;
          const lastSign = isDescending ? -1 : 1;
          if (a === null && b === null) return 0;
          if (a === null) return lastSign;
          if (b === null) return -lastSign;
          return a.localeCompare(b);
        },
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
      ...priorityCategoryColumns,
      {
        headerName: "タイトル",
        field: "title",
        sortable: true,
        flex: hasCategoryColumns ? 2 : 3,
        minWidth: 400,
        cellRenderer: TitleCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "添付",
        field: "attachmentCount",
        sortable: true,
        width: 90,
        cellRenderer: AttachmentCellRenderer,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "VIEW",
        field: "viewCount",
        sortable: true,
        // valueFormatter 만 있고 cellRenderer 가 없는 컬럼은 ag-grid 의 cellDataType 자동추론이
        // 정렬 클릭을 먹통으로 만드는 경우가 있어(登録日 등과 동일 이슈), 추론을 끄고 comparator 를 직접 지정.
        cellDataType: false,
        comparator: (a: number, b: number) => a - b,
        width: 90,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => params.data?.viewCount.toLocaleString() ?? "-",
      },
      ...otherCategoryColumns,
    ];

    if (isInternal) {
      baseCols.push(
        {
          headerName: "掲示対象",
          colId: TARGETS_SORT_COL_ID,
          sortable: true,
          cellDataType: false,
          // 콘텐츠당 표시순 첫 번째(=targetOrderRank 최솟값) 게시대상 기준 — 서버(route.ts
          // sortTargets 분기)와 동일 기준. 대상 없음(targets=[])은 방향과 무관하게 항상 뒤로
          // (isDescending 상쇄 로직은 카테고리/更新日 comparator 와 동일 이유).
          comparator: (
            _a: unknown,
            _b: unknown,
            nodeA: { data?: ContentListItem },
            nodeB: { data?: ContentListItem },
            isDescending: boolean,
          ) => {
            const rankOf = (item?: ContentListItem) =>
              item && item.targets.length > 0
                ? Math.min(...item.targets.map((t) => targetOrderRank(t.roleCode)))
                : null;
            const a = rankOf(nodeA.data);
            const b = rankOf(nodeB.data);
            const lastSign = isDescending ? -1 : 1;
            if (a === null && b === null) return 0;
            if (a === null) return lastSign;
            if (b === null) return -lastSign;
            return a - b;
          },
          cellRenderer: (params: ICellRendererParams<ContentListItem>) => {
            // rowData 에서 이미 정렬된 targets 를 사용 (cellRenderer sort 비용 회피)
            const targets = params.data?.targets ?? [];
            if (targets.length === 0) return <span>-</span>;
            return (
              <div className="flex flex-col gap-1 pt-3 pb-3 text-center">
                {targets.map((t) => (
                  // roleCode 는 콘텐츠당 unique(validateUniqueRoleCodes) — null(비회원)은 1건만 가능해 안전.
                  <span key={t.roleCode ?? "__non_member__"} className="text-xs">{resolveTargetLabel(t.roleCode)}</span>
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
          sortable: true,
          cellDataType: false,
          comparator: (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? ""),
          flex: 1,
          minWidth: 110,
          headerClass: "ag-header-cell-center",
          cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
          valueFormatter: (params) => orDash(params.value),
        },
        {
          headerName: "最終確認者",
          field: "approverLevel",
          sortable: true,
          cellDataType: false,
          comparator: (a: number | null | undefined, b: number | null | undefined) =>
            (a ?? -1) - (b ?? -1),
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

    // 헤더 텍스트가 한 줄(nowrap) 로 잘리지 않을 만큼 minWidth 를 보강.
    // 일본어/한자 1자 ≈ 16px + 셀 padding / sort 아이콘 여유 40px.
    // flex 컬럼만 보강 — 고정 width 컬럼(添付 등)은 의도된 폭이 있으므로 제외.
    // ag-grid 기본 truncate 가 발생하지 않게 하한선만 올리고, flex 분배는 기존대로 유지된다.
    const headerMinWidth = (name: string) => name.length * 16 + 40;
    return baseCols.map((col) => {
      if (col.flex == null) return col;
      return {
        ...col,
        minWidth: Math.max(col.minWidth ?? 0, headerMinWidth(col.headerName ?? "")),
      };
    });
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

  // 헤더 클릭 정렬 — colId 는 필드 컬럼은 field 값, 카테고리 컬럼은 명시한 categoryCode(colId) 값.
  // 어느 쪽인지 판별은 호출자(ContentsContents)가 CONTENT_SORT_FIELDS 화이트리스트로 수행.
  // AG Grid 는 단일 컬럼 정렬만 사용(멀티 정렬 UI 미제공) — 활성 정렬 컬럼 1개만 취해 전달.
  const handleSortChanged = (event: SortChangedEvent<ContentListItem>) => {
    const active = event.api.getColumnState().find((c) => c.sort);
    onSortChange(active?.colId, active?.sort ?? undefined);
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
        {/* 서버는 권한 로딩 전이라 항상 미노출 상태로 렌더 — 클라이언트에서 권한 확정 시점에
            표시 여부가 갈리면 Link/없음 구조 자체가 달라져 hydration 에러가 난다.
            노출 여부는 항상 마운트해두고 CSS(hidden)로만 제어해 트리 구조를 고정한다. */}
        <Link
          className={`hidden lg:block ${showCreateButton ? "" : "lg:hidden"}`}
          href="/contents/create"
          transitionTypes={["fade"]}
        >
          <Button variant="primary" className="w-[90px]">
            新規登録
          </Button>
        </Link>
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>
    </div>
  );

  // API 실패는 "결과 없음"과 구분되는 메시지로 안내 — 정렬/검색 파라미터 오류(400/500)가
  // 조용히 빈 목록으로 보이는 것을 방지.
  const emptyMessage = isError
    ? "コンテンツの取得に失敗しました。時間をおいて再度お試しください。"
    : "該当するコンテンツがありません。";

  return (
    <>
      {/* 데스크톱 */}
      {!isMobile && (
        <div className="hidden lg:flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
          {topBar}

          {/* rowData.length > 0 이면 TanStack Query 가 이전 성공 데이터를 유지한 채 isError=true
              (백그라운드 refetch 실패)일 수 있어, emptyMessage(빈 목록일 때만 노출)와 별개로
              항상 배너를 띄운다 — 오래된 목록이 조용히 계속 보이는 것을 방지. */}
          {isError && (
            <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
              コンテンツの取得に失敗しました。表示中の内容が最新でない可能性があります。
            </p>
          )}

          <div className="flex flex-col gap-6">
            <DataGrid<ContentListItem>
              columnDefs={columnDefs}
              rowData={rowData}
              className="contents-grid"
              loading={isLoading}
              emptyMessage={emptyMessage}
              autoHeight={!(isLoading || rowData.length === 0)}
              maxHeight={isLoading || rowData.length === 0 ? 200 : undefined}
              onSortChanged={handleSortChanged}
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
            {/* 데스크톱과 동일 이유 — data.length>0(이전 성공 캐시) 이어도 isError 면 항상 배너 노출. */}
            {isError && (
              <p className="mt-2 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
                コンテンツの取得に失敗しました。表示中の内容が最新でない可能性があります。
              </p>
            )}
          </div>
          <div className="block lg:hidden h-[10px] bg-[#F5F5F5]" />
          {data.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px] bg-white">
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
                {emptyMessage}
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
