"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

import { DataGrid } from "@/components/ag-grid/data-grid";
import {
  Button,
  CategoryNameList,
  DimSpinner,
  ProductCategoryLabel,
  ContentStateBadge,
  Pagination,
  ProductStatusBadge,
} from "@/components/common";
import { resolveVisibleAxes } from "@/components/contents/list/contents-facet-utils";
import type { CategoryNode } from "@/components/contents/list/contents-contents";
import { useIsInternal } from "@/hooks/use-is-internal";
import { setListRestoreFlag } from "@/hooks/use-list-state-persist";
import { getFallbackRole } from "@/lib/auth-role";
import api from "@/lib/axios";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { LoginUser } from "@/lib/schemas/auth";
import { AttachmentCellRenderer } from "@/components/contents/attachment-download";

/** `GET /api/products/:id` 의 자료 1건 — 목업 제품상세 자료목록 7컬럼에 필요한 필드 */
interface ProductDocument {
  id: number;
  title: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  hasBeenUpdated: boolean;
  isNew: boolean;
  isUpdated: boolean;
  categories: {
    id: number;
    categoryCode: string;
    name: string;
    isInternalOnly: boolean;
    children: { id: number; categoryCode: string; name: string; isInternalOnly: boolean }[];
  }[];
  targets: { roleCode: string | null; startAt: string | null; endAt: string | null }[];
  attachmentCount: number;
}

/**
 * 해당 축에서 보는 사람에게 노출할 2Depth 분류들.
 *
 * 사내전용 자식은 비사내 사용자에게 숨긴다 — 서버 트리에서 이미 걸러지지만 방어적으로 한 번 더
 * 본다(목록 `renderCategoryCell` 과 동일 정책). valueGetter(정렬·내보내기)와 cellRenderer(색)가
 * **같은 집합**을 써야 문자열과 화면이 어긋나지 않는다.
 */
function visibleChildrenOf(
  doc: ProductDocument | undefined,
  axisCategoryCode: string,
  isInternal: boolean,
): { name: string; isInternalOnly: boolean }[] {
  const matched = doc?.categories.find((c) => c.categoryCode === axisCategoryCode);
  return (matched?.children ?? []).filter((c) => isInternal || !c.isInternalOnly);
}

interface ProductDetailResponse {
  data: {
    product: {
      id: number;
      modelCode: string;
      /** 제품상태 — 형번의 속성(REQ-007). 헤더 배지에 쓴다 */
      status: "current" | "eol";
      sortOrder: number;
      category: {
        id: number;
        categoryCode: string;
        name: string;
        /** 사내전용 카테고리 적색 표기용 — 서버가 `PRODUCT_MODEL_CATEGORY_SELECT` 로 내려준다 */
        isInternalOnly: boolean;
        parent: { id: number; categoryCode: string; name: string } | null;
      };
    };
    contents: ProductDocument[];
  };
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

/**
 * 公開日 — 보는 사람에게 실제로 적용되는 게시 시작일시.
 * 판정 기준은 콘텐츠 목록(`contents-table.tsx#resolvePublishStartAt`)과 **동일**해야 한다 —
 * 같은 자료의 公開日 이 화면마다 달라지면 안 된다.
 */
function resolvePublishStartAt(
  doc: ProductDocument,
  isInternal: boolean,
  viewerRoleCode: string | null,
): string | null {
  if (!isInternal) {
    return doc.targets.find((t) => t.roleCode === viewerRoleCode)?.startAt ?? null;
  }
  if (doc.targets.length === 0) return null;
  if (doc.targets.some((t) => t.startAt === null)) return null;
  return doc.targets.reduce<string | null>(
    (min, t) => (min === null || (t.startAt !== null && t.startAt < min) ? t.startAt : min),
    null,
  );
}

interface ProductDetailProps {
  productId: string;
  page: number;
}

/**
 * 제품상세 — 검색 고도화 REQ-010 / 목업 `renderProductPage`(`01-search.html:1793`).
 *
 * 그 형번에 紐づく 자료를 나열한다. 검색화면의 분류축·키워드는 적용하지 않는다 —
 * 형번 하나만 기준으로 모은다.
 *
 * **분류 컬럼은 콘텐츠 목록과 같은 기준으로 동적 생성**한다(`resolveVisibleAxes`).
 * 목업은 `情報種別`·`資料種別` 2개만 두지만, 어느 축인지 특정하려면 축 코드를 화면에 박아야
 * 한다 — Phase 6 에서 걷어낸 방식이다. 표시 축이 바뀌면 이 화면도 따라간다.
 */
export function ProductDetail({ productId, page }: ProductDetailProps) {
  const router = useRouter();
  const isInternal = useIsInternal();

  // 로그인 사용자 — 목록과 동일하게 TanStack Query 캐시를 구독한다(layout Gnb 가 주입).
  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });
  const userScope = user ? `${user.userTp}:${user.authRole ?? "-"}` : "anon";
  const viewerRoleCode = user ? (user.authRole ?? getFallbackRole(user.userTp)) : null;

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories?activeOnly=true");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isFetching, isError, error } = useQuery<ProductDetailResponse>({
    queryKey: ["products", "detail", productId, page, userScope],
    queryFn: async () => {
      const res = await api.get<ProductDetailResponse>(`/products/${productId}`, {
        params: { page },
      });
      return res.data;
    },
    // 키에 `page`·`userScope` 가 있어 그 둘이 바뀌면 새 쿼리가 된다. 그때 이전 데이터를
    // 유지해야 `isLoading` 이 **첫 로드 전용**이 되고, 아래 로딩 가드가 페이지 이동마다
    // 화면을 덮지 않는다(자료상세와 같은 조건이 된다).
    placeholderData: keepPreviousData,
  });

  const isNotFound = isError && isAxiosError(error) && error.response?.status === 404;

  const contents = useMemo(() => data?.data.contents ?? [], [data]);
  // `?? 0` 은 훅 순서 때문에 로딩 가드보다 위에 있어야 해서 남는다 — 가드를 지나면
  // `data` 가 보장되므로 이 폴백이 화면에 쓰이는 경로는 없다.
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 0;

  const columnDefs = useMemo<ColDef<ProductDocument>[]>(() => {
    const categoryColumns: ColDef<ProductDocument>[] = resolveVisibleAxes(
      categories,
      isInternal,
    ).map((axis) => ({
      headerName: axis.name,
      colId: `cat-${axis.categoryCode}`,
      sortable: false,
      flex: 1,
      minWidth: 110,
      headerClass: "ag-header-cell-center",
      cellStyle: CENTER_CELL_STYLE,
      valueGetter: (params) => {
        const children = visibleChildrenOf(params.data, axis.categoryCode, isInternal);
        return children.length > 0 ? children.map((c) => c.name).join(", ") : "-";
      },
      // 사내전용 분류는 적색 — 목록·자료상세와 같은 표기.
      cellRenderer: (params: ICellRendererParams<ProductDocument>) => (
        <CategoryNameList
          categories={visibleChildrenOf(params.data, axis.categoryCode, isInternal)}
        />
      ),
    }));

    return [
      {
        headerName: "公開日",
        colId: "publishStartAt",
        sortable: false,
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: CENTER_CELL_STYLE,
        valueGetter: (params) =>
          params.data ? resolvePublishStartAt(params.data, isInternal, viewerRoleCode) : null,
        valueFormatter: (params) => (params.value ? formatDate(params.value) : "-"),
      },
      {
        headerName: "更新日",
        field: "updatedAt",
        sortable: false,
        flex: 1,
        minWidth: 110,
        headerClass: "ag-header-cell-center",
        cellStyle: CENTER_CELL_STYLE,
        // 목록과 동일 — 서버 hasBeenUpdated 가 단일 출처. 미수정이면 "-".
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
        sortable: false,
        flex: 2.5,
        minWidth: 300,
        headerClass: "ag-header-cell-center",
        // 제목이 먼저 줄고 뒤의 NEW/UPDATE 배지가 잘리지 않게 한다 — 정의는 ag-grid-theme.css
        cellClass: "ag-cell-title-flex",
        cellRenderer: (params: ICellRendererParams<ProductDocument>) => {
          const row = params.data;
          if (!row) return null;
          return (
            <button
              type="button"
              onClick={() => router.push(`/contents/${row.id}`, { transitionTypes: ["fade"] })}
              className="flex w-full min-w-0 items-center gap-2 overflow-hidden text-left font-['Noto_Sans_JP'] text-[14px] text-[#1060B4] underline"
            >
              {/* 이 버튼의 부모는 ag-grid 가 끼우는 `span.ag-cell-value`(display:block) 라
                  `flex-1` 은 듣지 않는다 — 폭을 맞추려면 `w-full` 이어야 한다. 그 span 과
                  `.ag-cell-wrapper` 의 `min-width:auto` 를 함께 풀어야 효과가 있어
                  `cellClass="ag-cell-title-flex"` 를 같이 건다(ag-grid-theme.css).
                  배지가 13px 로 커진 뒤 「UPDAT」로 잘렸던 원인이다. */}
              <span className="min-w-0 truncate">{row.title}</span>
              {/* `shrink-0`·`no-underline` 은 이 화면 고유 사정: 버튼 전체에 underline 이
                  걸려 있고 제목이 truncate 라 배지가 눌리면 안 된다. */}
              <ContentStateBadge
                isNew={row.isNew}
                isUpdated={row.hasBeenUpdated && row.isUpdated}
                className="shrink-0 no-underline"
              />
            </button>
          );
        },
      },
      {
        // Redmine #2759 — 종전에는 첨부 **건수(숫자)** 를 찍어 자료일람(다운로드 아이콘)과
        // 모양이 달랐다. 같은 셀 컴포넌트를 공유해 두 화면을 묶는다.
        headerName: "添付",
        field: "attachmentCount",
        sortable: false,
        width: 90,
        headerClass: "ag-header-cell-center",
        cellStyle: CENTER_CELL_STYLE,
        cellRenderer: AttachmentCellRenderer,
      },
      {
        headerName: "VIEW",
        field: "viewCount",
        sortable: false,
        width: 90,
        headerClass: "ag-header-cell-center",
        cellStyle: CENTER_CELL_STYLE,
        valueFormatter: (params) => params.data?.viewCount.toLocaleString() ?? "-",
      },
    ];
  }, [categories, isInternal, viewerRoleCode, router]);

  // 목록으로 — 콘텐츠 목록의 검색조건·페이지를 복원시킨다(상세→목록 복귀 규약).
  const handleList = () => {
    setListRestoreFlag("contents");
    router.push("/contents", { transitionTypes: ["fade"] });
  };

  if (isNotFound) {
    return (
      <main className="flex w-full flex-col items-center gap-4 px-6 py-[80px]">
        <p className="font-['Noto_Sans_JP'] text-[15px] text-[#101010]">
          製品が見つかりません。
        </p>
        <Button variant="primary" onClick={handleList}>
          リスト
        </Button>
      </main>
    );
  }

  // 로딩 가드 — 자료상세(`contents-detail.tsx:197`)와 **같은 처리**다. 값이 도착할
  // 때까지 화면을 그리지 않는다.
  //
  // 종전에는 `product?.modelCode ?? "-"` 로 **없는 값을 글자로 대체**했다. 그러면 응답이
  // 늦는 순간(캐시 없는 첫 진입 등)에 형번·카테고리가 `-`, 자료 건수가 `0` 으로 보여
  // 「값이 틀렸다」고 읽힌다 — Redmine #2763·#2764 의 증상이 이것이다.
  //
  // `product` 가 없는 경우는 **로딩 중과 조회 실패뿐**이다. API 는 형번이 없거나 노출
  // 대상이 아니면 404 를 내고(`api/products/[id]/route.ts:71`) 그건 바로 위에서 걸러낸다.
  // 둘 다 값처럼 보이는 글자를 보여줄 상황이 아니다.
  //
  // 전에 이 가드를 넣었다가 되돌렸는데(2026-11-04 리뷰), 문제는 가드가 아니라 쿼리 키에
  // `page`·`userScope` 가 있어 그 둘이 바뀔 때마다 `isLoading` 이 다시 true 가 되고,
  // `DimSpinner` 가 `fixed inset-0 z-50` 전체 화면 오버레이라 페이지 이동마다 암전된
  // 점이었다. 지금은 `placeholderData: keepPreviousData`(`:159`) 로 키가 바뀔 때 이전
  // 데이터를 유지하므로 `isLoading` 은 **첫 로드에만** true 다.
  if (isLoading) {
    return <DimSpinner />;
  }

  const product = data?.data.product;

  // 조회 실패 — 헤더를 폴백으로 그리지 않고 실패 사실만 알린다.
  // (404 는 위에서 전용 화면으로 빠진다)
  if (!product) {
    return (
      <main className="flex w-full flex-col items-center gap-4 px-6 py-[80px]">
        <p className="font-['Noto_Sans_JP'] text-[15px] text-[#ff1a1a]">
          製品情報の取得に失敗しました。時間をおいて再度お試しください。
        </p>
        <Button variant="primary" onClick={handleList}>
          リスト
        </Button>
      </main>
    );
  }


  return (
    <main className="flex w-full flex-col items-center gap-[10px] pb-[60px] lg:gap-[18px] lg:pb-[120px]">
      <div className="flex w-full max-w-[var(--page-max)] flex-col gap-[18px] rounded-[12px] bg-white px-6 pt-[34px] pb-[34px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
        {/* 헤더 — 형번 + 카테고리 + リスト */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* `translate="no"` — 형번은 고유명사라 번역 대상이 아니다. 위 로딩 가드가
              값을 보장하므로 폴백은 쓰지 않는다. */}
          <h1 translate="no" className="font-mono text-[22px] font-bold text-[#101010]">
            {product.modelCode}
          </h1>
          <span className="rounded-[4px] bg-[#F7F9FB] px-2 py-1 font-['Noto_Sans_JP'] text-[12px] font-medium text-[#45576F]">
            カテゴリ
          </span>
          {/* Redmine #2755(공통) — **2Depth 만** 표시한다. 종전에는 `제품분류 > 태양전지모듈`
              처럼 1Depth 까지 찍었다. 목업 `01-search.html:2127` 의 `${p.cat}` 도 2Depth
              단독이다. 정확히는 목업 `assets/qp-shell.js:230` 의 규칙—제품분류 하위는
              2Depth 만, 다른 축은 `1Depth > 2Depth`—를 `ProductCategoryLabel` 이 담고 있고
              제품일람 목록·형번관리도 같은 컴포넌트를 쓴다.

              카테고리명은 일본어라 번역돼도 뜻이 통하므로 `translate="no"` 를 붙이지 않는다.
              `ProductCategoryLabel` 이 사내전용 카테고리 적색 규칙도 함께 담당한다. */}
          <ProductCategoryLabel
            category={product.category}
            className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]"
          />
          {/* 製品ステータス — 목업 `01-search.html:2127` 의 헤더 구성(型番 / カテゴリ / 製品ステータス).
              형번의 속성이라 여기서 바로 보여준다. 자동완성으로 들어온 이용자가 단종 여부를
              이 화면에서 알 수 있어야 한다. */}
          <span className="rounded-[4px] bg-[#F7F9FB] px-2 py-1 font-['Noto_Sans_JP'] text-[12px] font-medium text-[#45576F]">
            製品ステータス
          </span>
          <ProductStatusBadge status={product.status} />
          <div className="ml-auto">
            <Button variant="primary" onClick={handleList}>
              リスト
            </Button>
          </div>
        </div>

        {/* 숫자에만 `translate="no"` — 건수는 번역 대상이 아니다. 로딩 가드가 값을
            보장하므로 `0` 폴백이 화면에 나오는 경로는 없다. */}
        <h2 className="font-['Noto_Sans_JP'] text-[15px] font-medium text-[#101010]">
          この製品の資料（
          <span translate="no" className="font-semibold text-[#E97923]">
            {total.toLocaleString()}
          </span>
          件）
        </h2>

        {isError && !isNotFound && (
          <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]">
            製品情報の取得に失敗しました。時間をおいて再度お試しください。
          </p>
        )}

        <div className="flex flex-col gap-6">
          {/* 첫 로드는 위 로딩 가드가 막으므로, 그리드의 `loading` 은 **재조회**
              (자료목록 페이지 이동 등) 에만 걸린다. */}
          <DataGrid<ProductDocument>
            columnDefs={columnDefs}
            rowData={contents}
            loading={isFetching}
            getRowId={(params) => String(params.data.id)}
            emptyMessage={
              isError
                ? "製品情報の取得に失敗しました。時間をおいて再度お試しください。"
                : "登録された資料はありません。"
            }
            autoHeight={!(isFetching || contents.length === 0)}
            maxHeight={isFetching || contents.length === 0 ? 200 : undefined}
          />
          {totalPages > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(next) =>
                router.push(`/products/${productId}?page=${next}`, {
                  transitionTypes: ["fade"],
                })
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}
