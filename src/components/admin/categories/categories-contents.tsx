"use client";

// Design Ref: §4.1 — 메인 컨테이너 (useQuery + useMutation 3개)

import { useState, useMemo } from "react";
import { isAxiosError } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { Spinner } from "@/components/common";
import { CategoriesTree } from "./categories-tree";
import { CategoriesDetail } from "./categories-detail";
import type {
  CategoryNode,
  CategoryFormState,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "./categories-types";
import { findCategoryById } from "./categories-types";

export function CategoriesContents() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // ─── Local State ───
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<number, true>>({});
  const [isNewMode, setIsNewMode] = useState(false);
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);
  const [hasUserToggled, setHasUserToggled] = useState(false);

  // ─── Server State: 목록 조회 ───
  const { data: treeData = [], isLoading } = useQuery<CategoryNode[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories", {
        params: { activeOnly: "false" },
      });
      return res.data.data;
    },
    staleTime: Infinity, // mutation invalidateQueries 시에만 refetch
  });

  // ─── API 에러 → UI 메시지 (Design Ref: §6) ───
  function handleApiError(err: unknown) {
    if (!isAxiosError(err) || !err.response) {
      openAlert({ type: "alert", message: "サーバーエラーが発生しました。しばらくしてからお試しください。" });
      return;
    }

    const { status, data } = err.response as { status: number; data: { error?: string } };
    const msg = data?.error ?? "";

    if (status === 409) {
      openAlert({ type: "alert", message: "入力されたカテゴリコードは既に使用中のカテゴリコードです。" });
    } else if (status === 400 && msg.includes("하위 카테고리")) {
      openAlert({ type: "alert", message: "下位カテゴリが存在するため削除できません。" });
    } else if (status === 400 && msg.includes("콘텐츠")) {
      openAlert({ type: "alert", message: "コンテンツが紐づいているため削除できません。" });
    } else if (status === 400 && msg.includes("2Depth")) {
      openAlert({ type: "alert", message: "カテゴリはDepth-2までのみ登録できます。" });
    } else if (status === 404) {
      openAlert({ type: "alert", message: "対象が見つかりません。" });
    } else {
      openAlert({ type: "alert", message: "サーバーエラーが発生しました。しばらくしてからお試しください。" });
    }
  }

  // ─── Mutations (Design Ref: §4.1) ───
  const createMutation = useMutation({
    mutationFn: (payload: CreateCategoryPayload) =>
      api.post<{ data: CategoryNode }>("/categories", payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setSelectedId(res.data.data.id);
      setIsNewMode(false);
      if (res.data.data.parentId !== null) {
        setExpandedIds((prev) => ({ ...prev, [res.data.data.parentId!]: true as const }));
      }
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCategoryPayload }) =>
      api.put(`/categories/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setSelectedId(null);
    },
    onError: handleApiError,
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

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

  // ─── 초기 로드 시 전체 1Depth 펼침 ───
  // treeData 로드 완료 시 expandedIds에 없는 1Depth를 추가
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
