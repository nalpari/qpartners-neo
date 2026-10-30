"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  RowClassParams,
  SortChangedEvent,
} from "ag-grid-community";
import { formatDate } from "@/lib/format";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, CategoryPath, PageSizeSelect, Pagination, ProductStatusBadge } from "@/components/common";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { MENU } from "@/lib/menu-codes";
import type { ContentListItem, CategoryNode, ListView } from "./contents-contents";
import type { ProductListRow } from "./contents-facet-utils";
import { resolveVisibleAxes } from "./contents-facet-utils";
import { useApprover } from "@/hooks/use-approver";
import { useTargetLabels } from "@/hooks/use-target-labels";
import { targetOrderRank } from "@/lib/target-role-order";
import { parseContentDispositionFilename } from "@/lib/content-disposition";
import { isInternalOnlyContent } from "@/lib/content-internal-only";

/**
 * 분류 컬럼 배치 — **카테고리 `sortOrder` 순으로 `更新日`↔`タイトル` 사이에 일괄**.
 *
 * 종전에는 `PRIORITY_CATEGORY_ORDER` 로 축 코드를 화면에 박아 앞/뒤를 갈랐는데, 그 상수가
 * 폐지된 `業務分類`(BIZ)·`内容分類`(CONT) 를 들고 있었다 — 축이 바뀌면 조용히 어긋나는 방식이다.
 * 축의 구성·순서·표시 여부는 전부 카테고리관리에서 정해지도록 코드에서 걷어냈다 (2026-10-12 결정).
 *
 * 목업(`01-search.html:1511`)은 `製品ステータス` 만 VIEW 뒤에 두지만, 그 위치를 표현할
 * 데이터 속성이 없어 축 코드 하드코딩이 필요하다 — `sortOrder` 순 일괄로 근사한다.
 */

/** 掲示対象 컬럼 정렬 식별용 colId — 카테고리(categoryCode)·고정 필드와 겹치지 않는 예약값.
 *  ContentsContents.handleSortChange 가 이 값으로 sortTargets=true 요청을 분기한다. */
export const TARGETS_SORT_COL_ID = "__targets__";

/** 정렬 키 — 콘텐츠당 해당 부모 카테고리의 "표시순 첫 번째" 자식 카테고리명 (없으면 null).
 *  서버(route.ts)의 sortCategoryCode 로직과 동일 기준(children[0])을 사용해야 화면 정렬과
 *  실제 서버 정렬 결과가 어긋나지 않는다.
 *
 *  children 배열은 buildCategoryTree 가 sortOrder ASC → id ASC 로 안정 정렬하여 반환하므로
 *  children[0] 은 항상 "sortOrder 최소값" 자식으로 결정론적이다 (서버·클라이언트 동일 보장). */
function getFirstCategoryChildName(item: ContentListItem, parentCategoryCode: string): string | null {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  return matched?.children[0]?.name ?? null;
}

/** 콘텐츠 아이템의 카테고리를 부모 코드 기준으로 매칭하여 렌더링 (빈값 시 "-")
 * 비사내 사용자(`isInternal = false`)에게는 사내전용 카테고리 라벨을 숨긴다.
 * Issue: #2160 — 비회원 화면에서 사내전용 카테고리 라벨이 노출되던 문제 차단.
 *
 * 사내전용 판정(적색)은 **카테고리 트리**(`internalCategoryIds`)를 기준으로 한다.
 * 목록 응답 안의 `isInternalOnly` 는 그 목록을 조회한 시점의 값이라, 카테고리관리에서
 * 설정을 바꾸고 곧바로 목록으로 넘어오면 좌측 사이드바(트리 기준)만 적색이 되고 셀은
 * 옛 색으로 남는다 — 새로고침해야 맞아지던 증상이 이것이다. 두 곳이 같은 소스를 보게 한다.
 */
function renderCategoryCell(
  item: ContentListItem,
  parentCategoryCode: string,
  inlineStyle: boolean,
  isInternal: boolean,
  internalCategoryIds: Set<number>,
): ReactNode {
  const matched = item.categories.find((c) => c.categoryCode === parentCategoryCode);
  if (!matched || matched.children.length === 0) {
    return <span style={inlineStyle ? { fontSize: "12px" } : undefined}>-</span>;
  }
  const isInternalCat = (c: { id: number }) => internalCategoryIds.has(c.id);
  const normal = matched.children.filter((c) => !isInternalCat(c));
  const internal = isInternal ? matched.children.filter(isInternalCat) : [];
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

/**
 * 公開日 — 보는 사람에게 실제로 적용되는 게시 시작일시.
 *
 * - 비관리자: 본인 계층(roleCode)의 게시대상 startAt. 목록에 뜬 행이면 본인 대상이 반드시 1건 있다.
 * - 관리자(SUPER_ADMIN/ADMIN): 여러 계층을 한 칸에 담을 수 없으므로 **최단(가장 빠른) 공개일** 1건만.
 *
 * startAt=null 은 "시작 제한 없음"(즉시 공개)이라 찍을 날짜가 없다 → null 반환("-" 표시).
 * 관리자 뷰에서 한 계층이라도 null 이면 그게 최단이므로 마찬가지로 null — 남은 날짜 중
 * 최솟값을 보여주면 실제보다 늦은 날짜를 최단으로 표기하게 된다.
 */
function resolvePublishStartAt(
  item: ContentListItem,
  isInternal: boolean,
  viewerRoleCode: string | null,
): string | null {
  // 그리드가 다른 행 타입을 잠깐 물고 있는 순간에도 터지지 않게 방어한다 — 근본 원인(탭 전환 시
  // 그리드 인스턴스 재사용)은 DataGrid 의 key 로 막았지만, valueGetter 는 화면 전체를 내리는
  // 자리라 한 칸의 데이터 결손으로 목록이 사라지면 안 된다.
  const targets = item.targets ?? [];
  if (!isInternal) {
    return targets.find((t) => t.roleCode === viewerRoleCode)?.startAt ?? null;
  }
  if (targets.length === 0) return null;
  if (targets.some((t) => t.startAt === null)) return null;
  // ISO 8601 문자열은 사전순 = 시간순 (登録日 comparator 와 동일 전제).
  return targets.reduce<string | null>(
    (min, t) => (min === null || (t.startAt !== null && t.startAt < min) ? t.startAt : min),
    null,
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
      {/* NEW 우선순위(동시 충족 시 UPDATE 숨김)는 서버 resolveBadgeFlags 가 이미 반영해 내려준다 */}
      {data.hasBeenUpdated && data.isUpdated && (
        <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-[#FFF3F8] border border-[#F8E3EB] font-pretendard font-medium text-[13px] leading-[1.5] text-[#BC6E8D] whitespace-nowrap">
          UPDATE
        </span>
      )}
    </div>
  );
}

type DownloadResult =
  | { ok: true }
  /** 실패 시 axios 응답 상태 코드 (네트워크 단절 등 응답 자체가 없으면 undefined) */
  | { ok: false; status?: number };

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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 브라우저가 Blob URL을 읽기 전에 즉시 해제하면 일부 브라우저에서 0바이트 다운로드가
    // 발생하므로, 충분한 시간을 준 뒤 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return { ok: true };
  } catch (err: unknown) {
    if (isAxiosError(err)) {
      console.error("[Contents] ZIP 일괄 다운로드 실패:", { status: err.response?.status, data: err.response?.data });
    } else {
      console.error("[Contents] ZIP 일괄 다운로드 실패:", err);
    }
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

/** 상세 화면(contents-detail-body.tsx MetaBadge)과 동일한 라벨(흰 배경 박스) + 값 스타일.
 *  value 는 문자열뿐 아니라 아이콘(添付 뱃지)도 받을 수 있게 ReactNode 로 둔다. */
/**
 * 사내전용 자료 행 지색 — 좌측 「社内会員の投稿のみ表示」 와 같은 기준(`isInternalOnlyContent`)을 쓴다.
 * 반환하면 짝수행 지브라(`ag-row-striped`)를 대체한다 — 지색이 줄무늬에 끊기지 않게 하려는 의도.
 */
function getDocumentRowClass(params: RowClassParams<ContentListItem>): string | undefined {
  // 탭 전환 순간 제품 행(`targets` 없음)이 자료용 그리드에 들어오는 사례가 있었다(아래 `key` 주석 참조).
  // 여기서 터지면 목록 전체가 죽으므로 배열 여부를 먼저 본다.
  const targets = params.data?.targets;
  if (!Array.isArray(targets)) return undefined;
  return isInternalOnlyContent(targets) ? "ag-row-internal" : undefined;
}

function MobileMetaBadge({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] bg-white border border-[#EEE] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
        {label}
      </span>
      <span className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#999] flex items-center">
        {value}
      </span>
    </div>
  );
}

/** 모바일 목록 카드 — 상단: 登録日/公開日/VIEW/添付 뱃지(흰 박스+라벨+값) 한 줄, 하단: 굵은 제목.
 *  NEW/UPDATE 뱃지는 컴팩트 카드 디자인 방침에 따라 의도적으로 미표시. */

function MobileContentCard({
  item,
  isInternal,
  viewerRoleCode,
  onClick,
}: {
  item: ContentListItem;
  isInternal: boolean;
  viewerRoleCode: string | null;
  onClick: () => void;
}) {
  const { openAlert } = useAlertStore();

  const handleDownload = (e: MouseEvent) => {
    e.stopPropagation();
    void (async () => {
      const result = await downloadAllAttachments(item.id);
      if (!result.ok) {
        openAlert({ type: "alert", message: resolveDownloadErrorMessage(result.status) });
      }
    })();
  };

  return (
    // stretched button 패턴: absolute inset-0 버튼으로 카드 전체 클릭 영역을 확보하고,
    // 내부 다운로드 <button>은 relative로 stacking order상 위에 위치해 중첩을 회피한다.
    <div
      className={`relative px-6 py-5 flex flex-col gap-3 ${
        isInternalOnlyContent(item.targets) ? "bg-[#FDF2F2]" : "bg-white"
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer"
        aria-label={item.title}
        onClick={onClick}
      />
      {/* 상단 — 登録日 / 公開日 / VIEW / 添付. 라벨은 상세 화면(ContentsDetailBody MetaBadge)과 동일 명칭.
          登録日 는 PC 그리드와 같은 규칙으로 관리자에게만 노출한다. */}
      <div className="relative flex items-center gap-3">
        {isInternal && (
          <MobileMetaBadge label="登録日" value={item.createdAt ? formatDate(item.createdAt) : "-"} />
        )}
        <MobileMetaBadge
          label="公開日"
          value={(() => {
            const startAt = resolvePublishStartAt(item, isInternal, viewerRoleCode);
            return startAt ? formatDate(startAt) : "-";
          })()}
        />
        <MobileMetaBadge label="VIEW" value={item.viewCount.toLocaleString()} />
        {item.attachmentCount > 0 && (
          <button
            type="button"
            onClick={handleDownload}
            aria-label="添付ファイルダウンロード"
            className="cursor-pointer"
          >
            <MobileMetaBadge
              label="添付"
              value={
                <Image
                  src="/asset/images/layout/download_icon.svg"
                  alt="添付ファイル"
                  width={14}
                  height={16}
                  unoptimized
                />
              }
            />
          </button>
        )}
      </div>

      {/* 하단 — 제목(볼드). position 미지정(non-positioned) 유지 — relative 를 주면 stacking
          순서상 absolute 오버레이 버튼(위 stretched button) 보다 위로 올라와 클릭을 가로챈다. */}
      <p className="font-['Noto_Sans_JP'] font-bold text-[15px] leading-[1.5] text-[#101010] break-words whitespace-normal">
        {item.title}
      </p>
    </div>
  );
}

// 게시대상 라벨/순서 — useTargetLabels 훅으로 통합. 정적 fallback 은 훅 내부에서 처리.

interface ContentsTableProps {
  isInternal?: boolean;
  /** 보는 사람의 계층 권한코드 (null = 비회원/비로그인) — 公開日 칸에서 본인 게시대상을 고를 때 사용. */
  viewerRoleCode?: string | null;
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
  /** 검색/필터 변경 시 부모가 증가시키는 카운터 — 변경 시 ag-grid 정렬 UI 초기화. */
  sortResetKey?: number;
  /**
   * 복원 진입(상세 복귀/브라우저 뒤로가기) 시 헤더에 표시할 초기 정렬. 마운트 후 1회만 반영한다.
   * 데이터 정렬 자체는 부모가 이미 sort 파라미터로 조회하므로, 여기서는 헤더 UI 동기화 용도.
   */
  initialSort?: { colId: string; dir: "asc" | "desc" } | null;
  /** 선택된 탭 — `探し方`(좌측 필터 영역의 `ContentsModeSwitch`)가 정한다 (REQ-005) */
  view: ListView;
  /** 제품일람 탭 데이터 — 자료 검색 결과를 형번 단위로 묶은 집계 */
  productData: ProductListRow[];
  productMeta?: { total: number; page: number; pageSize: number; totalPages: number };
  isProductLoading: boolean;
  isProductError?: boolean;
  /** 제품일람 대상 카테고리가 1건 이상인지 — 0건이면 안내 문구가 달라진다 */
  isProductAxisEnabled: boolean;
}

export function ContentsTable({
  isInternal = false,
  viewerRoleCode = null,
  categories = [],
  data,
  meta,
  isLoading,
  isError = false,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  sortResetKey,
  initialSort = null,
  view,
  productData,
  productMeta,
  isProductLoading,
  isProductError = false,
  isProductAxisEnabled,
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

  const isProdView = view === "prod";
  const activeMeta = isProdView ? productMeta : meta;
  const totalCount = activeMeta?.total ?? 0;
  const currentPage = activeMeta?.page ?? 1;
  const totalPages = activeMeta?.totalPages ?? 1;


  const columnDefs = useMemo<ColDef<ContentListItem>[]>(() => {
    // 사내전용 2Depth id — 적색 판정의 단일 소스(좌측 사이드바와 같은 트리).
    const internalCategoryIds = new Set<number>();
    for (const parent of categories) {
      for (const child of parent.children) {
        if (child.isInternalOnly) internalCategoryIds.add(child.id);
      }
    }

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
        return renderCategoryCell(
          params.data,
          parent.categoryCode,
          true,
          isInternal,
          internalCategoryIds,
        );
      },
      flex: 1,
      minWidth: 90,
      headerClass: "ag-header-cell-center",
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    });

    // 축 선정 기준은 좌측 사이드바와 **동일**하다 (`resolveVisibleAxes`) — 컬럼과 축이
    // 갈라지면 "사이드바엔 있는데 컬럼엔 없는 분류" 가 생긴다.
    // 순서는 카테고리 `sortOrder`(API 가 그 순으로 반환) 그대로.
    const visibleParents = resolveVisibleAxes(categories, isInternal);
    const categoryColumns = visibleParents.map(toCategoryColumn);
    const hasCategoryColumns = visibleParents.length > 0;

    const baseCols: ColDef<ContentListItem>[] = [
      // 登録日 는 운영 정보라 관리자(SUPER_ADMIN/ADMIN)에게만 노출한다. 일반 사용자에게 의미 있는
      // 날짜는 "언제부터 볼 수 있게 됐는가"(公開日) 쪽이라, 그 자리를 公開日 이 대신한다.
      ...(isInternal
        ? [
            {
              headerName: "登録日",
              field: "createdAt",
              sortable: true,
              // ag-grid 의 cellDataType 자동추론이 valueFormatter 만 있는(cellRenderer 없는) 컬럼에서
              // 정렬 클릭 자체를 먹통으로 만드는 경우가 있어, 추론을 끄고 comparator 를 직접 지정한다.
              // 실제 정렬은 서버(sortField/sortDir)가 수행 — 여기 comparator 는 클릭 활성화 목적.
              cellDataType: false,
              // ISO 8601 문자열은 사전순 = 시간순이 성립 — localeCompare 보다 명시적으로 정확한 비교.
              comparator: (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0),
              flex: 1,
              minWidth: 110,
              headerClass: "ag-header-cell-center",
              cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
              valueFormatter: (params) => (params.value ? formatDate(params.value) : "-"),
            } satisfies ColDef<ContentListItem>,
          ]
        : []),
      {
        // 公開日 — 게시대상(ContentTarget) 의 시작일시. 서버에 대응 정렬 필드가 없고 계층별로
        // 값이 달라(관리자는 최단값 파생) 페이지 경계를 넘는 정렬이 불가능하므로 정렬 미제공.
        headerName: "公開日",
        colId: "publishStartAt",
        sortable: false,
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueGetter: (params) =>
          params.data ? resolvePublishStartAt(params.data, isInternal, viewerRoleCode) : null,
        valueFormatter: (params) => (params.value ? formatDate(params.value) : "-"),
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
          // ISO 8601 string은 사전순 비교 = 시간순 비교와 동일하다.
          return a < b ? -1 : a > b ? 1 : 0;
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
      ...categoryColumns,
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
      {
        // 製品ステータス — 목업 `01-search.html:1842` 의 자료일람 컬럼 순서(VIEW 다음).
        // 값은 **연결된 형번에서 파생**한다(REQ-005) — 카테고리 축이 아니다.
        // 연결 형번이 없으면 「-」.
        headerName: "製品ステータス",
        colId: "productStatus",
        width: 130,
        cellDataType: false,
        valueGetter: (p) =>
          p.data?.productStatus === "eol"
            ? "販売終了品"
            : p.data?.productStatus === "current"
              ? "現行品"
              : "-",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
      },
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
          comparator: (
            _a: unknown,
            _b: unknown,
            nodeA: { data?: ContentListItem },
            nodeB: { data?: ContentListItem },
            isDescending: boolean,
          ) => {
            const a = nodeA.data?.authorDepartment ?? null;
            const b = nodeB.data?.authorDepartment ?? null;
            const lastSign = isDescending ? -1 : 1;
            if (a === null && b === null) return 0;
            if (a === null) return lastSign;
            if (b === null) return -lastSign;
            return a.localeCompare(b, "ja");
          },
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
          comparator: (
            _a: unknown,
            _b: unknown,
            nodeA: { data?: ContentListItem },
            nodeB: { data?: ContentListItem },
            isDescending: boolean,
          ) => {
            const a = nodeA.data?.approverLevel ?? null;
            const b = nodeB.data?.approverLevel ?? null;
            const lastSign = isDescending ? -1 : 1;
            if (a === null && b === null) return 0;
            if (a === null) return lastSign;
            if (b === null) return -lastSign;
            return a - b;
          },
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
  }, [isInternal, viewerRoleCode, categories, approverLabelMap, isLoadingApprover, resolveTargetLabel]);

  const handleMobileItemClick = (item: ContentListItem) => {
    router.push(`/contents/${item.id}`, { transitionTypes: ["fade"] });
  };

  const gridApiRef = useRef<GridApi<ContentListItem> | null>(null);

  // api 는 ref 로 보관하되, 준비 완료 시점을 effect 에 알리기 위해 카운터도 함께 증가시킨다.
  // boolean 이 아니라 카운터인 이유: 반응형 전환(useIsMobile)으로 DataGrid 가 unmount 후
  // 재mount 되면 새 grid 인스턴스가 만들어지는데, boolean 은 true→true 라 상태 변화가 없어
  // 아래 재적용 effect 가 다시 돌지 못한다.
  const [gridReadyCount, setGridReadyCount] = useState(0);

  const handleGridReady = (event: GridReadyEvent<ContentListItem>) => {
    gridApiRef.current = event.api;
    setGridReadyCount((c) => c + 1);
  };

  // sortResetKey 가 변경되면 ag-grid 컬럼 정렬 UI 초기화 (검색/필터 변경 시 부모가 증가).
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api || api.isDestroyed()) return;
    api.applyColumnState({ state: [], defaultState: { sort: null } });
  }, [sortResetKey]);

  // 복원 진입 시 초기 정렬을 헤더에 1회 반영 (Redmine #2490).
  // 카테고리 컬럼은 categories 응답 이후 생성되므로, 해당 colId 가 생길 때까지 columnDefs
  // 변경마다 재시도한다. applyColumnState 는 source="api" 로 sortChanged 를 발생시키지만
  // handleSortChanged 가 이를 무시하므로 부모 상태를 되돌리지 않는다.
  const isInitialSortAppliedRef = useRef(false);
  useEffect(() => {
    if (isInitialSortAppliedRef.current || !initialSort) return;
    const api = gridApiRef.current;
    // ag-grid 는 destroy 후에도 GridApi 객체 자체는 살아있지만 내부 fns/beans 가 비워져
    // getColumnState() 가 undefined 를 반환한다 — 그대로 역참조하면 TypeError 로 목록이
    // 크래시하므로, 파기 여부를 먼저 확인하고 반환값도 방어적으로 다룬다.
    if (!api || api.isDestroyed()) return;
    const columnState = api.getColumnState();
    if (!columnState?.some((c) => c.colId === initialSort.colId)) return;
    api.applyColumnState({
      state: [{ colId: initialSort.colId, sort: initialSort.dir }],
      defaultState: { sort: null },
    });
    isInitialSortAppliedRef.current = true;
  }, [initialSort, gridReadyCount, columnDefs]);

  // 헤더 클릭 정렬 — colId 는 필드 컬럼은 field 값, 카테고리 컬럼은 명시한 categoryCode(colId) 값.
  // 어느 쪽인지 판별은 호출자(ContentsContents)가 CONTENT_SORT_FIELDS 화이트리스트로 수행.
  // AG Grid 는 단일 컬럼 정렬만 사용(멀티 정렬 UI 미제공) — 활성 정렬 컬럼 1개만 취해 전달.
  /**
   * 제품일람 4컬럼 — `製品カテゴリ` / `型番` / `製品ステータス` / `資料数`.
   * 요구사항정의서 v1.1 REQ-005, 목업 `renderProdTable`.
   *
   * 헤더 클릭 정렬은 붙이지 않았다. 정렬 기준이 REQ-005 로 **카테고리 표시순서 → 형번
   * 오름차순**으로 확정돼(2026-10-20 業務レビュー) 사용자가 바꿀 축이 아니기 때문이다.
   * 기본 정렬은 서버가 정하며, **키워드가 있어도 관련도순으로 바뀌지 않는다**
   * (`api/products/route.ts` 4단계 주석 참조).
   */
  const productColumnDefs = useMemo<ColDef<ProductListRow>[]>(
    () => [
      {
        headerName: "製品カテゴリ",
        colId: "productCategory",
        sortable: false,
        flex: 1.4,
        minWidth: 160,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueGetter: (params) => {
          const category = params.data?.category;
          if (!category) return "-";
          // 제품일람 대상이 전 카테고리로 확장돼(REQ-008) 서로 다른 축에 같은 이름의
          // 2Depth 가 생길 수 있다 — 부모를 함께 보여 구분한다.
          return category.parent ? `${category.parent.name} > ${category.name}` : category.name;
        },
        // 사내전용 카테고리 적색 — 색만 renderer 로 얹고 문자열(정렬·내보내기)은 valueGetter 유지.
        cellRenderer: (params: ICellRendererParams<ProductListRow>) =>
          params.data ? <CategoryPath category={params.data.category} /> : "-",
      },
      {
        headerName: "型番",
        field: "modelCode",
        sortable: false,
        flex: 2,
        minWidth: 220,
        headerClass: "ag-header-cell-center",
        cellRenderer: (params: ICellRendererParams<ProductListRow>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <Link
              href={`/products/${row.id}`}
              transitionTypes={["fade"]}
              className="font-mono text-[14px] font-semibold text-[#1060B4] underline"
            >
              {row.modelCode}
            </Link>
          );
        },
      },
      {
        // 製品ステータス — 목업 제품일람 4컬럼 중 하나(`01-search.html:1854` `statusBadge`).
        // 형번의 속성이므로(REQ-007) 자료일람의 파생 텍스트와 달리 **배지**로 그린다.
        headerName: "製品ステータス",
        colId: "productStatus",
        flex: 1,
        cellRenderer: (p: ICellRendererParams<ProductListRow>) =>
          p.data ? <ProductStatusBadge status={p.data.status} /> : null,
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "資料数",
        field: "documentCount",
        sortable: false,
        width: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
        valueFormatter: (params) => params.data?.documentCount.toLocaleString() ?? "-",
      },
    ],
    [],
  );

  const handleSortChanged = (event: SortChangedEvent<ContentListItem>) => {
    // applyColumnState(source="api") 로 우리가 직접 넣은 정렬 초기화/복원은 무시한다 —
    // 부모의 정렬·페이지 상태를 되돌려(page=1) 복원 결과를 깨뜨리는 되먹임 차단.
    if (event.source === "api") return;
    const active = event.api.getColumnState().find((c) => c.sort);
    onSortChange(active?.colId, active?.sort ?? undefined);
  };

  // topBar 가 쓰므로 그보다 먼저 선언한다 (const 는 TDZ — 뒤에 두면 ReferenceError).
  const activeIsError = isProdView ? isProductError : isError;

  const topBar = (
    <div className="flex items-center justify-between gap-3">
      {/* key — **브라우저 자동 번역 대응**.
          Chrome 번역기는 「合計 N件の資料」 처럼 텍스트와 <span> 이 붙어 있는 구간을 통째로
          <font> 로 바꿔치기한다. 그 뒤 React 가 숫자만 갱신하면 번역된 블록은 옛 문장 그대로
          남아 **옛 건수와 새 건수가 겹쳐 보인다**(2026-10-13 실측: 제품일람 탭에서
          "총 2,423 건의 자료 3"). key 를 값에 걸어 요소를 통째로 교체하면 번역기가 다시 번역한다. */}
      <p
        key={`${isProdView ? "prod" : "doc"}-${activeIsError ? "err" : totalCount}`}
        className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] whitespace-nowrap"
      >
        合計{" "}
        {/* data-testid — E2E(`scripts/e2e`)가 결과 건수를 읽는 지점. 표기(`2,422`)가 바뀌어도
            테스트가 깨지지 않도록 숫자만 담긴 요소에 붙인다.
            translate="no" — 숫자는 번역 대상이 아니다. 번역 블록에 흡수되지 않게 떼어 둔다. */}
        {/* 조회 실패 시 `0` 을 쓰면 **「0건 검색됨」과 구분되지 않는다.** 실패는 `-` 로 표시한다
            (2026-10-13 피드백 7). 목록 쪽 오류 안내는 아래 emptyMessage 가 따로 띄운다. */}
        <span
          data-testid="result-total"
          translate="no"
          className="font-semibold text-[#E97923]"
        >
          {activeIsError ? "-" : totalCount.toLocaleString()}
        </span>
        {isProdView ? "件の製品" : "件の資料"}
      </p>
      <div className="flex items-center gap-[6px]">
        {/* 서버는 권한 로딩 전이라 항상 미노출 상태로 렌더 — 클라이언트에서 권한 확정 시점에
            표시 여부가 갈리면 Link/없음 구조 자체가 달라져 hydration 에러가 난다.
            노출 여부는 항상 마운트해두고 CSS(hidden)로만 제어해 트리 구조를 고정한다. */}
        <Link
          className={`hidden ${showCreateButton ? "lg:block" : ""}`}
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

  // 제품일람은 "결과 0건" 과 "제품일람 대상 카테고리가 아직 없음" 을 구분해 안내한다 —
  // 후자는 검색을 바꿔도 해결되지 않고 카테고리관리 설정이 필요하다 (목업 `renderEmpty`).
  const productEmptyMessage = isProductError
    ? "製品一覧の取得に失敗しました。時間をおいて再度お試しください。"
    : !isProductAxisEnabled
      ? "製品一覧に表示するカテゴリがありません。管理者設定 > カテゴリ管理の「製品一覧表示」で対象カテゴリを選択してください。"
      : "該当する製品がありません。";


  return (
    <>
      {/* 데스크톱 */}
      {!isMobile && (
        <div className="hidden lg:flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-full min-w-0">
          {topBar}

          {/* rowData.length > 0 이면 TanStack Query 가 이전 성공 데이터를 유지한 채 isError=true
              (백그라운드 refetch 실패)일 수 있어, emptyMessage(빈 목록일 때만 노출)와 별개로
              항상 배너를 띄운다 — 오래된 목록이 조용히 계속 보이는 것을 방지. */}
          {activeIsError && (
            <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
              {isProdView
                ? "製品一覧の取得に失敗しました。表示中の内容が最新でない可能性があります。"
                : "コンテンツの取得に失敗しました。表示中の内容が最新でない可能性があります。"}
            </p>
          )}

          <div className="flex flex-col gap-6">
            {isProdView ? (
              // key 필수 — 두 DataGrid 가 삼항의 **같은 자리**에 있어 key 가 없으면 React 가
              // 같은 인스턴스로 재사용한다. 탭 전환 순간 ag-grid 에 제품 행(`targets` 없음)이
              // 먼저 들어가고 자료용 컬럼의 valueGetter 가 그 위에서 돌아
              // `Cannot read properties of undefined (reading 'find')` 로 터졌다(간헐적).
              <DataGrid<ProductListRow>
                key="product-grid"
                columnDefs={productColumnDefs}
                rowData={productData}
                className="contents-grid"
                loading={isProductLoading}
                emptyMessage={productEmptyMessage}
                getRowId={(params) => String(params.data.id)}
                autoHeight={!(isProductLoading || productData.length === 0)}
                maxHeight={isProductLoading || productData.length === 0 ? 200 : undefined}
              />
            ) : (
              <DataGrid<ContentListItem>
                key="document-grid"
                columnDefs={columnDefs}
                rowData={rowData}
                className="contents-grid"
                loading={isLoading}
                emptyMessage={emptyMessage}
                autoHeight={!(isLoading || rowData.length === 0)}
                maxHeight={isLoading || rowData.length === 0 ? 200 : undefined}
                getRowClass={getDocumentRowClass}
                onGridReady={handleGridReady}
                onSortChanged={handleSortChanged}
                suppressMultiSort
              />
            )}
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
            {activeIsError && (
              <p className="mt-2 font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
                {isProdView
                  ? "製品一覧の取得に失敗しました。表示中の内容が最新でない可能性があります。"
                  : "コンテンツの取得に失敗しました。表示中の内容が最新でない可能性があります。"}
              </p>
            )}
          </div>
          <div className="block lg:hidden h-[10px] bg-[#F5F5F5]" />
          {/* 제품일람 모바일 — REQ-006 모바일 전용 UI 는 차기. 목록을 읽고 상세로 갈 수 있는
              최소 형태만 제공한다(3컬럼을 한 줄 카드로). */}
          {isProdView ? (
            productData.length === 0 ? (
              <div className="flex items-center justify-center min-h-[300px] bg-white px-6">
                <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
                  {productEmptyMessage}
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[#EFF4F8] bg-white">
                {productData.map((row) => (
                  <Link
                    key={row.id}
                    href={`/products/${row.id}`}
                    transitionTypes={["fade"]}
                    className="flex flex-col gap-1 px-6 py-4"
                  >
                    <CategoryPath
                      category={row.category}
                      className="font-['Noto_Sans_JP'] text-[12px] text-[#6a88a9]"
                    />
                    <span className="font-mono text-[14px] font-semibold text-[#1060B4]">
                      {row.modelCode}
                    </span>
                    <span className="font-['Noto_Sans_JP'] text-[12px] text-[#101010]">
                      資料数 {row.documentCount.toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            )
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px] bg-white">
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999] text-center">
                {emptyMessage}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#EFF4F8]">
              {rowData.map((item) => (
                <MobileContentCard
                  key={item.id}
                  item={item}
                  isInternal={isInternal}
                  viewerRoleCode={viewerRoleCode}
                  onClick={() => handleMobileItemClick(item)}
                />
              ))}
            </div>
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
