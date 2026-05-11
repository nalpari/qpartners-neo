"use client";

// Design Ref: §4.1 — 메인 컨테이너 (2-Column 레이아웃 + 상태 관리)

import { useState, useMemo } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { Spinner } from "@/components/common";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";
import { CategoriesTree } from "./categories-tree";
import { CategoriesDetail } from "./categories-detail";
import type { CategoryFormState, CascadePreview } from "./categories-types";
import { findCategoryById } from "./categories-types";
import { useCategoryQuery } from "./use-category-query";
import { useCategoryMutations } from "./use-category-mutations";

export function CategoriesContents() {
  const { openAlert } = useAlertStore();

  // RBAC 표준 패턴 — ADM_CATEGORY 매트릭스 가드. 컨테이너 단일 호출 후 자식(detail) prop 주입
  // 으로 부모/자식 중복 호출에 따른 isLoading 깜빡임 차단 (PR #148 리뷰 학습).
  // 로딩 중 fail-closed (isPermLoading 시 readonly). 서버 가드 (requireMenuPermission) 가 최종 검증.
  // mode 별 가드는 자식(CategoriesDetail) 에서 isNewMode 분기로 처리.
  const {
    canCreate: canCreateCategory,
    canUpdate: canUpdateCategory,
    canDelete: canDeleteCategory,
    isLoading: isPermLoading,
  } = useMenuPermission(ADMIN_MENU.CATEGORIES);

  // ─── Local State ───
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<number, true>>({});
  const [isNewMode, setIsNewMode] = useState(false);
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [hasUserToggled, setHasUserToggled] = useState(false);
  // CategoriesDetail 내부 form state 를 리마운트로 재초기화하기 위한 토큰.
  // 초기화 버튼 클릭 시 증가 → key 변경 → CategoriesDetail 이 selectedCategory/INITIAL_FORM 으로 재생성.
  const [resetToken, setResetToken] = useState(0);
  // cascade-preview 호출 중 더블클릭 가드 — preview API 호출 중에는 deleteMutation.isPending 가
  // 아직 false 이므로 별도 플래그로 삭제 버튼 disabled 처리.
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // ─── Server State ───
  const { data: treeData = [], isLoading, isError } = useCategoryQuery();

  const { createMutation, updateMutation, deleteMutation, isSaving } = useCategoryMutations({
    onCreateSuccess: (node) => {
      setSelectedId(node.id);
      setIsNewMode(false);
      const parentId = node.parentId;
      if (parentId !== null) {
        setExpandedIds((prev) => ({ ...prev, [parentId]: true as const }));
      }
    },
    onDeleteSuccess: () => {
      setSelectedId(null);
    },
  });

  // ─── 파생 데이터 ───
  // Plan SC: SC-07 — 사내전용 필터 + 사용여부 필터(#2103)
  // 표시값은 DB 원본 그대로(자식 OR 덮어쓰기 금지) — 부모 자체값 수정이 목록에 즉시 반영되도록.
  // 필터 매칭만 「부모 자체 매칭 OR 자식 매칭」 룰을 적용하여 사내전용 자식이 있는 부모도
  // 필터 결과에 포함되도록 한다.
  const filteredTree = useMemo(() => {
    if (!filterInternalOnly && !filterActiveOnly) return treeData;
    const matchSelf = (n: { isInternalOnly: boolean; isActive: boolean }) =>
      (!filterInternalOnly || n.isInternalOnly) &&
      (!filterActiveOnly || n.isActive);
    return treeData
      .map((parent) => ({
        ...parent,
        children: parent.children.filter(matchSelf),
      }))
      .filter((p) => matchSelf(p) || p.children.length > 0);
  }, [treeData, filterInternalOnly, filterActiveOnly]);

  const totalCount = filteredTree.reduce(
    (sum, p) => sum + 1 + p.children.length,
    0,
  );

  const selectedCategory = selectedId ? findCategoryById(treeData, selectedId) : null;

  const parentOptions = treeData.map((c) => ({ label: c.name, value: String(c.id) }));

  // ─── 핸들러 ───
  const handleSelect = (id: number) => {
    setSelectedId(id);
    setIsNewMode(false);
  };

  const handleToggle = (id: number) => {
    // 첫 토글 시점: expandedIds 는 {} 이지만 expandedWithDefaults 파생값이 전체 1Depth 를
    // true 로 노출. 이 상태를 실제 state 로 동기화한 뒤 target 만 토글해야
    // hasUserToggled=true 전환 시 다른 카테고리까지 함께 접히는 현상 방지.
    setExpandedIds((prev) => {
      const base = hasUserToggled
        ? prev
        : treeData.reduce<Record<number, true>>((acc, node) => {
            acc[node.id] = true;
            return acc;
          }, {});
      const next = { ...base };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
    setHasUserToggled(true);
  };

  // Plan SC: SC-04, SC-05 — 신규 등록 / 수정
  // RBAC 패턴 E — 핸들러 본체 권한 가드 (PR #148 리뷰 학습). disabled 우회(키보드/race) 시
  // mutate 도달 전 차단. 로딩 중은 silent return — 권한 응답 도착 전 alert 노출 방지.
  // mode (isNewMode) 별로 필요한 액션 분기 — create 또는 update.
  const handleSave = (form: CategoryFormState) => {
    if (isPermLoading) return;
    if (isNewMode ? !canCreateCategory : !canUpdateCategory) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    if (!form.categoryCode.trim()) {
      openAlert({ type: "alert", message: "カテゴリコードは必須入力項目です。" });
      return;
    }
    if (!form.name.trim()) {
      openAlert({ type: "alert", message: "カテゴリ名は必須入力項目です。" });
      return;
    }

    if (isNewMode) {
      createMutation.mutate({
        parentId: form.parentId,
        categoryCode: form.categoryCode.trim(),
        name: form.name.trim(),
        isInternalOnly: form.isInternalOnly,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      });
    } else if (selectedId !== null) {
      updateMutation.mutate({
        id: selectedId,
        payload: {
          name: form.name.trim(),
          isInternalOnly: form.isInternalOnly,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        },
      });
    }
  };

  // Plan SC: SC-06 — 삭제
  // 서버 측 cascade-preview API 로 자손 카테고리/연결 콘텐츠 수를 정확히 집계하여
  // 운영자에게 영향 범위를 표시. 클라이언트 트리는 비활성/사내전용 필터로 일부 노드가
  // 누락될 수 있어, 백엔드 카운트를 기준으로 한다 (영향 범위 과소 표시 방지).
  const handleDelete = async () => {
    // 더블클릭/연타 가드 — preview API in-flight 중 재진입 차단.
    if (selectedId === null || isPreviewLoading) return;
    // RBAC 패턴 E — cascade-preview API 자체가 ADM_CATEGORY.delete 가드를 갖는 BE 라우트.
    // FE 도 호출 직전 동일 액션 가드로 일관성 유지 (PR #148 리뷰 학습).
    if (isPermLoading) return;
    if (!canDeleteCategory) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }

    let preview: CascadePreview;
    setIsPreviewLoading(true);
    try {
      const res = await api.get<{ data: CascadePreview }>(
        `/categories/${selectedId}/cascade-preview`,
      );
      preview = res.data.data;
    } catch (err) {
      console.error("[Categories] cascade-preview 호출 실패:", err);
      const status = isAxiosError(err) ? err.response?.status : undefined;
      let message: string;
      if (status === 422) {
        message = "下位カテゴリー数が多すぎます。先に下位を整理してから削除してください。";
      } else if (status === 404) {
        // 다른 세션에서 이미 삭제된 케이스 — 트리 새로고침 유도.
        message = "対象のカテゴリーが見つかりません。ページを更新してください。";
      } else {
        message = "削除前の影響範囲を取得できませんでした。しばらくしてからお試しください。";
      }
      openAlert({ type: "alert", message });
      return;
    } finally {
      setIsPreviewLoading(false);
    }

    // 라인 구성: 해당 영향이 있는 경우(>0)에만 안내 라인 추가.
    // contentLinkCount === 0 이면 "コンテンツの紐付け..." 라인 자체를 숨겨 불필요 정보 노출 방지.
    const messageLines = [
      preview.descendantCount > 0
        ? `下位カテゴリー${preview.descendantCount}件もすべて削除されます。`
        : null,
      preview.contentLinkCount > 0
        ? `関連するコンテンツの紐付け${preview.contentLinkCount}件が自動で解除されます（コンテンツ本体は残ります）。`
        : null,
      "削除してもよろしいですか？",
    ].filter((line): line is string => line !== null);
    openAlert({
      type: "confirm",
      message: messageLines.join("\n"),
      onConfirm: () => deleteMutation.mutate(selectedId),
    });
  };

  const handleNew = () => {
    // RBAC 패턴 E — 신규 모드 전환은 create 권한 필수. UI(disabled) 와 핸들러 본체 이중 가드.
    if (isPermLoading) return;
    if (!canCreateCategory) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    setIsNewMode(true);
    setSelectedId(null);
  };

  // 선택/신규 상태는 유지한 채 상세 폼만 원본으로 되돌림:
  // - 카테고리 선택 중: selectedCategory 데이터로 재초기화
  // - 신규 모드: INITIAL_FORM(빈 값) 으로 재초기화
  // resetToken 증가 → key 변경 → CategoriesDetail 리마운트 (useState 초기값 재평가)
  const handleReset = () => {
    setResetToken((v) => v + 1);
  };

  // ─── 사용자 토글 전까지 전체 1Depth 펼침 ───
  const expandedWithDefaults = useMemo(() => {
    if (treeData.length === 0 || hasUserToggled) return expandedIds;
    const map: Record<number, true> = {};
    for (const c of treeData) {
      map[c.id] = true;
    }
    return map;
  }, [treeData, expandedIds, hasUserToggled]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-[1440px] h-[400px]">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center w-[1440px] h-[400px]">
        <p className="text-[14px] text-[#999] font-['Noto_Sans_JP']">
          カテゴリの読み込みに失敗しました。ページを更新してください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-[18px] items-start w-[1440px] pb-[48px]">
      <CategoriesTree
        treeData={filteredTree}
        selectedId={selectedId}
        expandedIds={expandedWithDefaults}
        totalCount={totalCount}
        filterInternalOnly={filterInternalOnly}
        filterActiveOnly={filterActiveOnly}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onFilterChange={setFilterInternalOnly}
        onActiveOnlyChange={setFilterActiveOnly}
      />
      <CategoriesDetail
        key={`${isNewMode ? "new" : String(selectedId)}-${resetToken}`}
        selectedCategory={selectedCategory}
        parentOptions={parentOptions}
        treeData={treeData}
        isNewMode={isNewMode}
        // preview 로딩 중에도 삭제/저장 버튼 disabled — 중복 요청 차단.
        isSaving={isSaving || isPreviewLoading}
        // RBAC 표준 패턴 — 부모 단일 호출 + 자식 prop 주입. 자식 컴포넌트 내부에서
        // useMenuPermission 중복 호출 시 발생하는 isLoading 깜빡임 회귀 차단 (PR #148 리뷰 학습).
        canCreate={canCreateCategory}
        canUpdate={canUpdateCategory}
        canDelete={canDeleteCategory}
        isPermLoading={isPermLoading}
        onSave={handleSave}
        onDelete={handleDelete}
        onNew={handleNew}
        onReset={handleReset}
      />
    </div>
  );
}
