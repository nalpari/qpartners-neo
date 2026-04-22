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
  // CategoriesDetail 내부 form state 를 리마운트로 재초기화하기 위한 토큰.
  // 초기화 버튼 클릭 시 증가 → key 변경 → CategoriesDetail 이 selectedCategory/INITIAL_FORM 으로 재생성.
  const [resetToken, setResetToken] = useState(0);

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
  // 연결된 콘텐츠 링크(ContentCategory)는 Cascade 로 자동 해제됨을 사용자에게 고지.
  // 콘텐츠 본체는 보존되며 카테고리 매핑만 해제됨.
  const handleDelete = () => {
    if (selectedId === null) return;
    openAlert({
      type: "confirm",
      message:
        "関連するコンテンツの紐付けは自動で解除されます（コンテンツ本体は残ります）。\n削除してもよろしいですか？",
      onConfirm: () => deleteMutation.mutate(selectedId),
    });
  };

  const handleNew = () => {
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
        onSelect={handleSelect}
        onToggle={handleToggle}
        onFilterChange={setFilterInternalOnly}
      />
      <CategoriesDetail
        key={`${isNewMode ? "new" : String(selectedId)}-${resetToken}`}
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
