"use client";

// Design Ref: §5.1 — 메인 컨테이너 (상태 관리 + 2-Column 레이아웃)

import { useState, useMemo } from "react";
import { useAlertStore } from "@/lib/store";
import {
  DUMMY_CATEGORIES,
  buildTree,
  generateNextId,
} from "./categories-dummy-data";
import type { CategoryItem } from "./categories-dummy-data";
import { CategoriesTree } from "./categories-tree";
import { CategoriesDetail } from "./categories-detail";

interface CategoryFormState {
  isInternalOnly: boolean;
  parentId: number | null;
  categoryCode: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export function CategoriesContents() {
  const { openAlert } = useAlertStore();

  const [categories, setCategories] = useState<CategoryItem[]>(DUMMY_CATEGORIES);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<number, true>>(() => {
    const map: Record<number, true> = {};
    for (const c of DUMMY_CATEGORIES) {
      if (c.parentId === null) map[c.id] = true;
    }
    return map;
  });
  const [isNewMode, setIsNewMode] = useState(false);
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);

  // Plan SC: SC-01 — 트리 구조 변환
  const treeData = useMemo(() => buildTree(categories), [categories]);

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
    0
  );

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;

  const parentOptions = categories
    .filter((c) => c.parentId === null)
    .map((c) => ({ label: c.name, value: String(c.id) }));

  // Plan SC: SC-03 — 카테고리 선택
  const handleSelect = (id: number) => {
    setSelectedId(id);
    setIsNewMode(false);
  };

  // Plan SC: SC-02 — 펼침/접힘 토글
  const handleToggle = (id: number) => {
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
    if (!form.categoryCode.trim() || !form.name.trim()) {
      openAlert({
        type: "alert",
        message: "カテゴリコードとカテゴリ名は必須です。",
      });
      return;
    }

    if (isNewMode) {
      const isDuplicate = categories.some(
        (c) => c.categoryCode === form.categoryCode.trim()
      );
      if (isDuplicate) {
        openAlert({
          type: "alert",
          message: "同じカテゴリコードが既に存在します。",
        });
        return;
      }

      const newItem: CategoryItem = {
        id: generateNextId(categories),
        parentId: form.parentId,
        categoryCode: form.categoryCode.trim(),
        name: form.name.trim(),
        isInternalOnly: form.isInternalOnly,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      setCategories((prev) => [...prev, newItem]);
      setSelectedId(newItem.id);
      setIsNewMode(false);

      if (newItem.parentId !== null) {
        setExpandedIds((prev) => ({ ...prev, [newItem.parentId!]: true as const }));
      }

      openAlert({ type: "alert", message: "カテゴリを登録しました。" });
    } else if (selectedId !== null) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                name: form.name.trim(),
                isInternalOnly: form.isInternalOnly,
                sortOrder: form.sortOrder,
                isActive: form.isActive,
              }
            : c
        )
      );
      openAlert({ type: "alert", message: "カテゴリを保存しました。" });
    }
  };

  // Plan SC: SC-06 — 삭제
  const handleDelete = () => {
    if (selectedId === null) return;

    const hasChildren = categories.some((c) => c.parentId === selectedId);
    if (hasChildren) {
      openAlert({
        type: "alert",
        message: "下位カテゴリが存在するため削除できません。",
      });
      return;
    }

    openAlert({
      type: "confirm",
      message: "このカテゴリを削除してもよろしいですか？",
      onConfirm: () => {
        setCategories((prev) => prev.filter((c) => c.id !== selectedId));
        setSelectedId(null);
      },
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

  return (
    <div className="flex gap-[18px] items-start w-[1440px] pb-[48px]">
      <CategoriesTree
        treeData={filteredTree}
        selectedId={selectedId}
        expandedIds={expandedIds}
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
        isNewMode={isNewMode}
        onSave={handleSave}
        onDelete={handleDelete}
        onNew={handleNew}
        onReset={handleReset}
      />
    </div>
  );
}
