"use client";

// Design Ref: §5.1 — 메인 컨테이너 (useQuery + useMutation 3개)

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { MenusInfoForm } from "./menus-info-form";
import { MenusTables } from "./menus-tables";
import type { MenuFormState } from "./menus-types";
import { EMPTY_FORM, toMenuItem, toCreateBody, toUpdateBody, toFormState } from "./menus-types";

export function MenusContents() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // --- 로컬 state ---
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [formState, setFormState] = useState<MenuFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortValues, setSortValues] = useState<Record<string, number>>({});

  // --- API 조회 ---
  // Plan R-01: GET /api/menus → useMenuTree 훅으로 공통화
  const { data: menuTree = [] } = useMenuTree({ activeOnly });

  // --- 파생 데이터 (API 응답 → UI 변환, useMemo로 안정화) ---
  const level1Menus = useMemo(() => menuTree.map(toMenuItem), [menuTree]);
  const level2Menus = useMemo(
    () => selectedLevel1Id
      ? (menuTree.find((m) => String(m.id) === selectedLevel1Id)?.children ?? []).map(toMenuItem)
      : [],
    [menuTree, selectedLevel1Id],
  );

  const selectedLevel1Name =
    level1Menus.find((m) => m.id === selectedLevel1Id)?.menuName ?? "";

  const level1Options = useMemo(
    () => level1Menus.map((m) => ({ label: m.menuName, value: m.id })),
    [level1Menus],
  );

  // --- Mutations ---

  // Plan R-04: POST /api/menus — 메뉴 등록
  const createMutation = useMutation({
    mutationFn: async (body: ReturnType<typeof toCreateBody>) => {
      const res = await api.post("/menus", body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
      handleNew();
    },
    onError: (error: unknown) => {
      console.error("[POST /api/menus] 메뉴 등록 실패:", error);
      if (isAxiosError(error) && error.response?.status === 409) {
        openAlert({ type: "alert", message: "既に存在するMenu Codeです。", confirmLabel: "確認" });
      } else {
        openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
      }
    },
  });

  // Plan R-05: PUT /api/menus/{id} — 메뉴 수정
  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ReturnType<typeof toUpdateBody> }) => {
      const res = await api.put(`/menus/${id}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[PUT /api/menus] 메뉴 수정 실패:", error);
      if (isAxiosError(error) && error.response?.status === 404) {
        openAlert({ type: "alert", message: "メニューが見つかりません。画面を更新してください。", confirmLabel: "確認" });
      } else {
        openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
      }
    },
  });

  // Plan R-06: PUT /api/menus/sort — 정렬순서 일괄 저장
  const sortMutation = useMutation({
    mutationFn: async (items: { id: number; sortOrder: number }[]) => {
      const res = await api.put("/menus/sort", { items });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      setSortValues({});
      openAlert({ type: "alert", message: "整列が保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[PUT /api/menus/sort] 정렬 저장 실패:", error);
      openAlert({ type: "alert", message: "整列の保存に失敗しました。", confirmLabel: "確認" });
    },
  });

  // --- 핸들러 ---

  // Plan R-05: 신규 버튼 → 폼 초기화
  const handleNew = () => {
    setFormState(EMPTY_FORM);
    setIsEditing(false);
    setEditingId(null);
  };

  // Plan R-06: 저장 버튼 → 등록 또는 수정
  const handleSave = () => {
    if (!formState.menuCode.trim()) {
      openAlert({ type: "alert", message: "Menu Codeは必須です。", confirmLabel: "確認" });
      return;
    }
    if (!formState.menuName.trim()) {
      openAlert({ type: "alert", message: "Menu Nameは必須です。", confirmLabel: "確認" });
      return;
    }

    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, body: toUpdateBody(formState) });
    } else {
      createMutation.mutate(toCreateBody(formState));
    }
  };

  // Plan R-03: 1-Level Menu Name 클릭 → 폼 바인딩 + 2-Level 표시
  const handleLevel1Click = (id: string) => {
    setSelectedLevel1Id(id);
    const apiMenu = menuTree.find((m) => String(m.id) === id);
    if (apiMenu) {
      setFormState(toFormState(apiMenu));
      setIsEditing(true);
      setEditingId(id);
    }
  };

  // 2-Level Menu Name 클릭 → 폼 바인딩 (수정 모드)
  const handleLevel2Click = (id: string) => {
    const parent = menuTree.find((m) => String(m.id) === selectedLevel1Id);
    const apiMenu = parent?.children.find((c) => String(c.id) === id);
    if (apiMenu) {
      setFormState(toFormState(apiMenu));
      setIsEditing(true);
      setEditingId(id);
    }
  };

  const handleFormChange = (field: keyof MenuFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  // Plan R-07: 정렬저장 — sortValues에 기록된 변경사항만 전송
  const handleSortSave = () => {
    const items = Object.entries(sortValues).map(([id, sortOrder]) => ({
      id: Number(id),
      sortOrder,
    }));

    if (items.length === 0) return;
    sortMutation.mutate(items);
  };

  // Sort input 값 변경
  const handleSortValueChange = (id: string, value: number) => {
    setSortValues((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <div className="flex flex-col gap-[32px] w-[1440px]">
        {/* 상단: 메뉴정보 */}
        <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px]">
          <MenusInfoForm
            form={formState}
            level1Options={level1Options}
            isEditing={isEditing}
            isSaving={createMutation.isPending || updateMutation.isPending}
            onFormChange={handleFormChange}
            onNew={handleNew}
            onSave={handleSave}
          />
        </section>

        {/* 하단: 메뉴목록 */}
        <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px]">
          <MenusTables
            level1Data={level1Menus}
            level2Data={level2Menus}
            selectedLevel1Id={selectedLevel1Id}
            selectedLevel1Name={selectedLevel1Name}
            activeOnly={activeOnly}
            onActiveFilterChange={setActiveOnly}
            onLevel1Click={handleLevel1Click}
            onLevel2Click={handleLevel2Click}
            onSortSave={handleSortSave}
            onSortValueChange={handleSortValueChange}
            sortValues={sortValues}
            isSortSaving={sortMutation.isPending}
          />
        </section>
      </div>
    </main>
  );
}
