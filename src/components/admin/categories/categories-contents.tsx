"use client";

// Design Ref: §4.1 — 메인 컨테이너 (2-Column 레이아웃 + 상태 관리)

import { useState, useMemo } from "react";
import { useAlertStore } from "@/lib/store";
import { Spinner } from "@/components/common";
import { CategoriesTree } from "./categories-tree";
import { CategoriesDetail } from "./categories-detail";
import type { CategoryFormState } from "./categories-types";
import { findCategoryById } from "./categories-types";
import { useCategoryQuery } from "./use-category-query";
import { useCategoryMutations } from "./use-category-mutations";

export function CategoriesContents() {
  const { openAlert } = useAlertStore();

  // ─── Local State ───
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<number, true>>({});
  const [isNewMode, setIsNewMode] = useState(false);
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);
  const [hasUserToggled, setHasUserToggled] = useState(false);

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
  // Plan SC: SC-07 — 사내전용 필터
  const filteredTree = useMemo(() => {
    if (!filterInternalOnly) return treeData;
    return treeData
      .map((parent) => ({
        ...parent,
        children: parent.children.filter((c) => c.isInternalOnly),
      }))
      .filter((p) => p.isInternalOnly || p.children.length > 0);
  }, [treeData, filterInternalOnly]);

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
    setHasUserToggled(true);
    setExpandedIds((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  };

  // Plan SC: SC-04, SC-05 — 신규 등록 / 수정
  const handleSave = (form: CategoryFormState) => {
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
  const handleDelete = () => {
    if (selectedId === null) return;
    openAlert({
      type: "confirm",
      message: "削除してもよろしいですか？",
      onConfirm: () => deleteMutation.mutate(selectedId),
    });
  };

  const handleNew = () => {
    setIsNewMode(true);
    setSelectedId(null);
  };

  const handleReset = () => {
    setSelectedId(null);
    setIsNewMode(false);
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
        onSelect={handleSelect}
        onToggle={handleToggle}
        onFilterChange={setFilterInternalOnly}
      />
      <CategoriesDetail
        key={isNewMode ? "new" : String(selectedId)}
        selectedCategory={selectedCategory}
        parentOptions={parentOptions}
        treeData={treeData}
        isNewMode={isNewMode}
        isSaving={isSaving}
        onSave={handleSave}
        onDelete={handleDelete}
        onNew={handleNew}
        onReset={handleReset}
      />
    </div>
  );
}
