"use client";

// Design Ref: §5.1 — 메인 컨테이너 (useQuery + useMutation 3개)

import { useState, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { MenusInfoForm } from "./menus-info-form";
import { MenusTables } from "./menus-tables";
import type { MenuFormState } from "./menus-types";
import { EMPTY_FORM, toMenuItem, toCreateBody, toUpdateBody, toFormState } from "./menus-types";
import type { MenuApiItem } from "./menus-types";

export function MenusContents() {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  // --- 로컬 state ---
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [formState, setFormState] = useState<MenuFormState>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  // 정렬 순서 변경값은 ref 에 누적 — state 로 두면 입력 1회마다 부모 리렌더 →
  // MenusTables 의 columnDefs 참조 갱신 → AG Grid 가 셀을 rebuild → uncontrolled
  // <input defaultValue> 의 타이핑값이 DOM 에서 손실되어 다중 행 일괄 변경이 불가했음.
  // ref 로 두면 타이핑은 부모 리렌더를 트리거하지 않으므로 모든 입력값이 보존된다.
  const sortValuesRef = useRef<Record<string, number>>({});
  // 정렬 저장 성공 시 증가 — input key 에 포함시켜 모든 sort input 을 강제 remount.
  // 사용자가 친 값과 server 의 새 sortOrder 가 같은 경우 key={data.sortOrder} 만으로는
  // remount 가 안 되어 typed 값이 DOM 에 남아 server 값과 불일치하는 표시 버그를 차단.
  const [sortRefreshVersion, setSortRefreshVersion] = useState(0);

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
      const res = await api.put<{ data: MenuApiItem }>(`/menus/${id}`, body);
      return res.data.data;
    },
    onSuccess: async (updatedMenu) => {
      // 서버 확정 데이터로 폼 즉시 동기화 — menuTree 리페치 race 와 무관하게
      // 같은 메뉴 재클릭 시 폼이 저장 전 값으로 회귀하는 현상 방지.
      setFormState(toFormState(updatedMenu));
      // alert 표시 전 리페치 완료를 보장 — 사용자가 alert 닫고 메뉴 클릭 시
      // 항상 최신 menuTree 가 반영된 상태에서 handleLevel1Click 가 실행되도록.
      await queryClient.invalidateQueries({ queryKey: ["menus"] });
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

  // DELETE /api/menus/{id} — 메뉴 삭제 (하위 메뉴는 cascade 삭제)
  //
  // isLevel1 분기: 1-level(부모) 삭제 시에만 selectedLevel1Id 를 해제한다.
  // 2-level(자식) 삭제 시에는 부모 선택을 유지해 사용자가 같은 부모의 다른 자식을
  // 연속으로 관리할 수 있도록 함 — 부모 행 하이라이트 + 2-level 목록 컨텍스트 보존.
  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string; isLevel1: boolean }) => {
      await api.delete(`/menus/${id}`);
    },
    onSuccess: async (_data, variables) => {
      handleNew();
      if (variables.isLevel1) {
        setSelectedLevel1Id(null);
      }
      // 삭제된 행이 사라지면서 selectedLevel1Id/editingId 변경이 동시에 일어나면
      // AG Grid 의 row teardown 과 React cellRenderer 의 commit phase 가 같은
      // 사이클에 충돌해 "removeChild ... not a child of this node" 가 재발한다.
      // 그리드 자체를 key 변경으로 remount 시켜 두 측면 모두 새로 시작 → race 차단.
      setSortRefreshVersion((v) => v + 1);
      await queryClient.invalidateQueries({ queryKey: ["menus"] });
      openAlert({ type: "alert", message: "削除されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[DELETE /api/menus/:id] 메뉴 삭제 실패:", error);
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 403) {
          openAlert({ type: "alert", message: "権限がありません。", confirmLabel: "確認" });
          return;
        }
        if (status === 404) {
          openAlert({ type: "alert", message: "メニューが見つかりません。画面を更新してください。", confirmLabel: "確認" });
          return;
        }
        if (status === 409) {
          openAlert({
            type: "alert",
            message: "孫メニューが存在するため削除できません。データ構造を確認してください。",
            confirmLabel: "確認",
          });
          return;
        }
      }
      openAlert({ type: "alert", message: "削除に失敗しました。", confirmLabel: "確認" });
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
      sortValuesRef.current = {};
      // 모든 sort input 강제 remount → server 값으로 재동기화 (typed 값 잔존 방지)
      setSortRefreshVersion((v) => v + 1);
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

  // Plan R-07: 정렬저장 — sortValuesRef 에 기록된 변경사항만 전송
  const handleSortSave = () => {
    const items = Object.entries(sortValuesRef.current).map(([id, sortOrder]) => ({
      id: Number(id),
      sortOrder,
    }));

    if (items.length === 0) return;
    sortMutation.mutate(items);
  };

  // Sort input 값 변경 — ref 직접 업데이트 (리렌더 없음, 다중 행 입력값 보존)
  const handleSortValueChange = (id: string, value: number) => {
    sortValuesRef.current[id] = value;
  };

  // 삭제 — 폼에 바인딩된 메뉴(editingId) 를 대상으로 confirm 후 DELETE 호출.
  // upperMenu 비어 있으면 1-level, 값 있으면 2-level (toFormState 가 parentId 를 매핑).
  // 1-level 인데 자식이 있으면 cascade 삭제됨을 명시 — 사용자가 인지하고 진행하도록.
  const handleDelete = () => {
    if (!isEditing || !editingId) {
      openAlert({
        type: "alert",
        message: "削除するメニューを選択してください。",
        confirmLabel: "確認",
      });
      return;
    }
    const targetName = formState.menuName || formState.menuCode;
    const isLevel1 = formState.upperMenu === "";
    const childCount = isLevel1
      ? menuTree.find((m) => String(m.id) === editingId)?.children.length ?? 0
      : 0;
    const message = childCount > 0
      ? `「${targetName}」と下位メニュー${childCount}件を削除しますか？`
      : `「${targetName}」を削除しますか？`;
    openAlert({
      type: "confirm",
      message,
      onConfirm: () => deleteMutation.mutate({ id: editingId, isLevel1 }),
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
            editingId={editingId}
            activeOnly={activeOnly}
            onActiveFilterChange={setActiveOnly}
            onLevel1Click={handleLevel1Click}
            onLevel2Click={handleLevel2Click}
            onSortSave={handleSortSave}
            onSortValueChange={handleSortValueChange}
            isSortSaving={sortMutation.isPending}
            sortRefreshVersion={sortRefreshVersion}
            onDelete={handleDelete}
            isDeleteEnabled={isEditing && editingId !== null}
            isDeleting={deleteMutation.isPending}
          />
        </section>
      </div>
    </main>
  );
}
