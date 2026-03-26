"use client";

import { useState } from "react";
import { useAlertStore } from "@/lib/store";
import { MenusInfoForm } from "./menus-info-form";
import { MenusTables } from "./menus-tables";
import { DUMMY_MENUS, EMPTY_FORM } from "./menus-dummy-data";
import type { MenuItem, MenuFormState } from "./menus-dummy-data";

// Design Ref: §5.1 — 메인 컨테이너 (전역 state + 레이아웃)

export function MenusContents() {
  const { openAlert } = useAlertStore();
  const [menus, setMenus] = useState<MenuItem[]>(DUMMY_MENUS);
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [formState, setFormState] = useState<MenuFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  // --- 파생 데이터 ---
  const level1Menus = menus
    .filter((m) => m.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const level2Menus = menus
    .filter((m) => m.parentId === selectedLevel1Id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const filteredLevel1 = activeOnly
    ? level1Menus.filter((m) => m.isActive === "Y")
    : level1Menus;
  const filteredLevel2 = activeOnly
    ? level2Menus.filter((m) => m.isActive === "Y")
    : level2Menus;

  const selectedLevel1Name =
    level1Menus.find((m) => m.id === selectedLevel1Id)?.menuName ?? "";

  const level1Options = level1Menus.map((m) => ({
    label: m.menuName,
    value: m.id,
  }));

  // --- 핸들러 ---

  const handleNew = () => {
    setFormState(EMPTY_FORM);
    setIsEditing(false);
    setEditingId(null);
  };

  const handleSave = () => {
    if (!formState.menuCode.trim()) {
      openAlert({
        type: "alert",
        message: "Menu Codeは必須です。",
        confirmLabel: "確認",
      });
      return;
    }

    if (isEditing && editingId) {
      // 수정
      setMenus((prev) =>
        prev.map((m) =>
          m.id === editingId
            ? {
                ...m,
                menuName: formState.menuName,
                pageUrl: formState.pageUrl,
                isActive: formState.isActive,
                showInTopNav: formState.showInTopNav,
                showInMobile: formState.showInMobile,
              }
            : m
        )
      );
    } else {
      // 신규 등록
      const newMenu: MenuItem = {
        id: `new-${Date.now()}`,
        parentId: formState.upperMenu || null,
        menuCode: formState.menuCode,
        menuName: formState.menuName,
        pageUrl: formState.pageUrl,
        isActive: formState.isActive,
        showInTopNav: formState.showInTopNav,
        showInMobile: formState.showInMobile,
        sortOrder: menus.length + 1,
      };
      setMenus((prev) => [...prev, newMenu]);
    }

    openAlert({
      type: "alert",
      message: "保存されました。",
      confirmLabel: "確認",
    });
  };

  const handleLevel1Click = (id: string) => {
    setSelectedLevel1Id(id);
    const menu = menus.find((m) => m.id === id);
    if (menu) {
      setFormState({
        upperMenu: menu.parentId ?? "",
        menuCode: menu.menuCode,
        menuName: menu.menuName,
        pageUrl: menu.pageUrl,
        isActive: menu.isActive,
        showInTopNav: menu.showInTopNav,
        showInMobile: menu.showInMobile,
      });
      setIsEditing(true);
      setEditingId(id);
    }
  };

  const handleFormChange = (field: keyof MenuFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSortSave = () => {
    setMenus((prev) => [...prev].sort((a, b) => a.sortOrder - b.sortOrder));
    openAlert({
      type: "alert",
      message: "整列が保存されました。",
      confirmLabel: "確認",
    });
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
            onFormChange={handleFormChange}
            onNew={handleNew}
            onSave={handleSave}
          />
        </section>

        {/* 하단: 메뉴목록 */}
        <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px]">
          <MenusTables
            level1Data={filteredLevel1}
            level2Data={filteredLevel2}
            selectedLevel1Id={selectedLevel1Id}
            selectedLevel1Name={selectedLevel1Name}
            activeOnly={activeOnly}
            onActiveFilterChange={setActiveOnly}
            onLevel1Click={handleLevel1Click}
            onSortSave={handleSortSave}
          />
        </section>
      </div>
    </main>
  );
}
