"use client";

import { useCallback, useState } from "react";
import { isAxiosError } from "axios";

import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { usePageSize } from "@/hooks/use-page-size";
import { ADMIN_MENU } from "@/lib/menu-codes";

import { ProductModelsDetail } from "./product-models-detail";
import { ProductModelsTable } from "./product-models-table";
import {
  INITIAL_FILTERS,
  type ProductModelCascadePreview,
  type ProductModelFormState,
  type ProductModelItem,
  type ProductModelSearchFilters,
} from "./product-models-types";
import { useProductModelMutations } from "./use-product-model-mutations";
import {
  useProductCategoryOptions,
  useProductModelList,
} from "./use-product-model-query";

/**
 * 형번관리 (型番管理) — 검색기능 고도화 REQ-007 / 목업 03-admin-models.html.
 *
 * 레이아웃은 목업대로 상하 2단이다 — 위가 `型番一覧`(검색조건 + 목록 + 페이저),
 * 아래가 `型番情報`(등록·편집 폼). 목록과 폼이 좌우로 붙는 카테고리관리와 달리,
 * 형번 목록은 6컬럼이라 가로를 다 쓰는 쪽이 읽기 쉽다.
 *
 * 저장·삭제가 성공하면 폼을 비운다(목업 `clearForm()`). 편집을 이어가고 싶으면
 * 목록에서 그 행을 다시 클릭한다.
 */
export function ProductModelsContents() {
  const { openAlert } = useAlertStore();

  // RBAC 표준 패턴 — 컨테이너 단일 호출 후 자식에 prop 주입.
  // 로딩 중 fail-closed. 서버 가드(`requireMenuPermission`)가 최종 검증한다.
  const {
    canCreate,
    canUpdate,
    canDelete,
    isLoading: isPermLoading,
  } = useMenuPermission(ADMIN_MENU.PRODUCT_MODEL);

  // ─── Local State ───
  const [filters, setFilters] = useState<ProductModelSearchFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  /** 편집 대상. null 이면 신규 입력 상태 (목업의 `editingId === null`) */
  const [selectedModel, setSelectedModel] = useState<ProductModelItem | null>(null);
  /** 初期化 로 폼을 되돌리기 위한 리마운트 토큰 */
  const [formResetToken, setFormResetToken] = useState(0);
  /** 検索条件 初期化 로 입력 버퍼를 비우기 위한 리마운트 토큰 */
  const [searchResetKey, setSearchResetKey] = useState(0);
  /** cascade-preview 호출 중 삭제 연타 가드 — deleteMutation.isPending 이 아직 false 인 구간 */
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // ─── Server State ───
  const { data, isLoading, isError } = useProductModelList(filters, page, pageSize);
  const {
    options: categoryOptions,
    inactiveLabels,
    isLoading: isCategoryLoading,
  } = useProductCategoryOptions();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 0;

  const clearForm = useCallback(() => {
    setSelectedModel(null);
    setFormResetToken((v) => v + 1);
  }, []);

  const { createMutation, updateMutation, deleteMutation, isSaving } =
    useProductModelMutations({
      onCreateSuccess: clearForm,
      onUpdateSuccess: clearForm,
      onDeleteSuccess: clearForm,
    });

  // ─── 핸들러 ───
  const handleFiltersChange = useCallback((next: ProductModelSearchFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
    setSearchResetKey((v) => v + 1);
  }, []);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    [setPageSize],
  );

  /** 행 클릭 = 편집 진입 (목업: 편집 버튼을 두지 않는다) */
  const handleSelect = useCallback((model: ProductModelItem) => {
    setSelectedModel(model);
  }, []);

  const handleNew = useCallback(() => {
    // RBAC 패턴 E — 신규 입력 전환은 create 권한 필수. 로딩 중은 silent return
    // (권한 응답 도착 전 의도와 무관한 alert 노출 방지).
    if (isPermLoading) return;
    if (!canCreate) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    clearForm();
  }, [isPermLoading, canCreate, openAlert, clearForm]);

  /** 편집 대상은 유지하고 폼 입력만 원본으로 되돌린다 (카테고리관리와 동일 시맨틱) */
  const handleResetForm = useCallback(() => {
    setFormResetToken((v) => v + 1);
  }, []);

  const handleSave = useCallback(
    (form: ProductModelFormState) => {
      const isEditMode = selectedModel !== null;
      // RBAC 패턴 E — disabled 우회(키보드/race) 시 mutate 도달 전 차단
      if (isPermLoading) return;
      if (isEditMode ? !canUpdate : !canCreate) {
        openAlert({ type: "alert", message: "権限がありません。" });
        return;
      }

      // 검증 순서는 목업과 동일 — 型番 → カテゴリ → 表示／非表示
      const modelCode = form.modelCode.trim();
      if (!modelCode) {
        openAlert({ type: "alert", message: "型番を入力してください。" });
        return;
      }
      if (form.categoryId === null) {
        openAlert({ type: "alert", message: "カテゴリを選択してください。" });
        return;
      }
      if (form.status === null) {
        openAlert({ type: "alert", message: "製品ステータスを選択してください。" });
        return;
      }
      if (form.isVisible === null) {
        openAlert({ type: "alert", message: "表示／非表示を選択してください。" });
        return;
      }

      // 동일 카테고리 내 중복은 **서버 UNIQUE 제약**이 판정한다(409 → 안내 문구).
      // 화면에서 미리 비교하면 콜레이션(대소문자·뒤 공백 무시) 기준이 둘로 갈라진다.
      const payload = {
        categoryId: form.categoryId,
        modelCode,
        status: form.status,
        // 목업과 동일하게 0·비수치는 1 로 보정 (서버 스키마도 양의 정수만 받는다)
        sortOrder: form.sortOrder > 0 ? form.sortOrder : 1,
        isVisible: form.isVisible,
      };

      if (isEditMode) {
        updateMutation.mutate({ id: selectedModel.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    },
    [
      selectedModel,
      isPermLoading,
      canUpdate,
      canCreate,
      openAlert,
      updateMutation,
      createMutation,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (isPreviewLoading) return;
    if (isPermLoading) return;
    if (!canDelete) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    if (selectedModel === null) {
      openAlert({ type: "alert", message: "削除する型番を一覧から選択してください。" });
      return;
    }

    // 연결된 자료 수를 먼저 조회해 영향 범위를 알린다 (목업 `modelLinkCount` 경고).
    let preview: ProductModelCascadePreview;
    setIsPreviewLoading(true);
    try {
      const res = await api.get<{ data: ProductModelCascadePreview }>(
        `/product-models/${selectedModel.id}/cascade-preview`,
      );
      preview = res.data.data;
    } catch (err) {
      console.error("[ProductModels] cascade-preview 호출 실패:", err);
      const status = isAxiosError(err) ? err.response?.status : undefined;
      openAlert({
        type: "alert",
        message:
          status === 404
            ? "対象の型番が見つかりません。ページを更新してください。"
            : "削除前の影響範囲を取得できませんでした。しばらくしてからお試しください。",
      });
      return;
    } finally {
      setIsPreviewLoading(false);
    }

    const messageLines = [
      preview.contentLinkCount > 0
        ? `この型番には ${preview.contentLinkCount} 件の資料が紐づいています。\n削除すると、その資料から「この型番との紐づけ」も一緒に削除されます（資料自体は残ります）。`
        : null,
      "本当に削除しますか？",
    ].filter((line): line is string => line !== null);

    openAlert({
      type: "confirm",
      message: messageLines.join("\n"),
      onConfirm: () => deleteMutation.mutate(selectedModel.id),
    });
  }, [
    isPreviewLoading,
    isPermLoading,
    canDelete,
    selectedModel,
    openAlert,
    deleteMutation,
  ]);

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 좌=목록 / 우=상세 — 배치도 폭 배분도 `카테고리관리`(`categories-contents.tsx`)와
          **같다**: 6:4 (`flex-[6]` / `flex-[4]`).

          2026-10-14 에는 이 화면만 「상세 520px 고정 + 목록이 나머지 전부」로 뒀다. 목록이
          6컬럼(No·型番·カテゴリ·表示順序·表示／非表示·登録日)이라 반반이면 헤더가 잘렸기
          때문이다(`表示順序`→`表…`). 그때는 본문 폭이 1440px 고정이어서 520px ≈ 36% 였다.
          2026-10-22 에 본문 폭이 **브라우저의 98%** 로 바뀌면서 그 전제가 깨졌다 — 넓은 화면에서
          상세만 520px 로 남아 비율이 무너진다. 그래서 두 화면 모두 6:4 비율로 통일했다
          (2026-10-23 사용자 결정). 6:4 는 종전 520px/1440px 비율에 가장 가깝고, 7:3 으로 하면
          카테고리관리 상세(입력 8필드)가 좁은 화면에서 읽기 어려워진다. */}
      <div className="flex items-start gap-[18px] w-[var(--page-max)]">
        <ProductModelsTable
          items={items}
          total={total}
          totalPages={totalPages}
          isLoading={isLoading}
          isError={isError}
          filters={filters}
          categoryOptions={categoryOptions}
          page={page}
          pageSize={pageSize}
          editingId={selectedModel?.id ?? null}
          searchResetKey={searchResetKey}
          onFiltersChange={handleFiltersChange}
          onResetFilters={handleResetFilters}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onSelect={handleSelect}
        />
        <ProductModelsDetail
          key={`${selectedModel?.id ?? "new"}-${formResetToken}`}
          selectedModel={selectedModel}
          categoryOptions={categoryOptions}
          inactiveLabels={inactiveLabels}
          // 카테고리 선택지 로딩 중에는 저장을 막는다 — 선택지가 비어 있는 상태로
          // 저장하면 카테고리 미선택 경고만 반복된다.
          isSaving={isSaving || isPreviewLoading || isCategoryLoading}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          isPermLoading={isPermLoading}
          onSave={handleSave}
          onDelete={handleDelete}
          onNew={handleNew}
          onReset={handleResetForm}
        />
      </div>
    </main>
  );
}
