"use client";

// Design Ref: §4 — 메뉴별 권한 설정 팝업 API 연동

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, Checkbox } from "@/components/common";
import type { RolePermissionsResponse, MenuPermissionRow } from "@/components/admin/permissions/permissions-types";
import { flattenMenuTree, rowsToPermissions } from "@/components/admin/permissions/permissions-types";

const CLOSE_ANIMATION_MS = 200;

type CrudKey = "read" | "create" | "update" | "delete";
const CRUD_KEYS: { key: CrudKey; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

const TH = "flex items-center justify-center bg-[#506273] py-3 px-3 overflow-hidden font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#f5f5f5] whitespace-nowrap";

export function PermissionMenuPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);

  const roleCode = popupData.roleCode as string;
  const roleName = (popupData.roleName as string) ?? "";

  // --- API 조회 ---
  const { data: apiData } = useQuery({
    queryKey: ["role-permissions", roleCode],
    queryFn: async () => {
      const res = await api.get<RolePermissionsResponse>(`/roles/${roleCode}/permissions`);
      return res.data.data;
    },
    enabled: !!roleCode,
  });

  // apiData를 source of truth로 사용, 변경사항만 overlay
  const baseRows = apiData ? flattenMenuTree(apiData.menus) : [];
  const [changes, setChanges] = useState<Record<string, Partial<MenuPermissionRow>>>({});

  const displayRows = baseRows.map((row) => ({
    ...row,
    ...changes[row.menuCode],
  }));

  // --- Mutation ---
  const saveMutation = useMutation({
    mutationFn: async (permissions: ReturnType<typeof rowsToPermissions>) => {
      const res = await api.put(`/roles/${roleCode}/permissions`, { permissions });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions", roleCode] });
      openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      console.error("[PUT /api/roles/permissions] 권한 저장 실패:", error);
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    },
  });

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = () => {
    saveMutation.mutate(rowsToPermissions(displayRows));
  };

  // Design Ref: §4.4 — CUD 체크 시 Read 자동 체크
  const toggleCell = (menuCode: string, key: CrudKey) => {
    const current = displayRows.find((r) => r.menuCode === menuCode);
    if (!current) return;
    const newValue = !current[key];
    const patch: Partial<MenuPermissionRow> = { ...changes[menuCode], [key]: newValue };
    // CUD 체크 시 Read 자동 체크
    const merged = { ...current, ...patch };
    if (merged.create || merged.update || merged.delete) {
      patch.read = true;
    }
    setChanges((prev) => ({ ...prev, [menuCode]: patch }));
  };

  const getColumnState = (key: CrudKey) => {
    const checked = displayRows.filter((r) => r[key]).length;
    if (checked === 0) return "none";
    if (checked === displayRows.length) return "all";
    return "some";
  };

  const toggleColumn = (key: CrudKey) => {
    const state = getColumnState(key);
    const newValue = state !== "all";
    const newChanges = { ...changes };
    for (const row of displayRows) {
      const patch: Partial<MenuPermissionRow> = { ...newChanges[row.menuCode], [key]: newValue };
      const merged = { ...row, ...patch };
      if (merged.create || merged.update || merged.delete) {
        patch.read = true;
      }
      newChanges[row.menuCode] = patch;
    }
    setChanges(newChanges);
  };

  return (
    <div className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`} style={{ overflow: "hidden" }}>
      <div
        className="popup-container !w-[1200px] !max-w-[1200px]"
        role="dialog"
        aria-modal="true"
        aria-label="Menu Setting"
      >
        <div className="popup-container__inner !gap-[18px]">
          {/* 타이틀 */}
          <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
            <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
              [{roleName}] Menu Setting
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#E97923] cursor-pointer"
              aria-label="閉じる"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 테이블 */}
          <div className="flex flex-col">
            {/* 헤더 */}
            <div className="flex items-stretch">
              <div className={`${TH} w-[180px] min-w-[180px] rounded-l-[8px]`}>Level 1</div>
              <div className={`${TH} w-[180px] min-w-[180px]`}>Level 2</div>
              <div className={`${TH} w-[120px] min-w-[120px]`}>Page URL</div>
              {CRUD_KEYS.map((col, i) => {
                const state = getColumnState(col.key);
                return (
                  <div
                    key={col.key}
                    className={`${TH} flex-1 flex-wrap gap-3 ${i === CRUD_KEYS.length - 1 ? "rounded-r-[8px]" : ""}`}
                  >
                    <span>{col.label}</span>
                    <Checkbox
                      checked={state === "all"}
                      indeterminate={state === "some"}
                      onChange={() => toggleColumn(col.key)}
                    />
                  </div>
                );
              })}
            </div>

            {/* 바디 */}
            <div className="flex flex-col max-h-[400px] overflow-y-auto">
              {displayRows.map((row, i) => (
                <div
                  key={row.menuCode}
                  className={`flex items-stretch ${i % 2 !== 0 ? "bg-[#fcfdff]" : "bg-white"}`}
                >
                  <div className="w-[180px] min-w-[180px] flex items-center justify-center py-2 px-3 border-b border-r border-[#e6eef6]">
                    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555] font-bold">
                      {row.level1}
                    </span>
                  </div>
                  <div className="w-[180px] min-w-[180px] flex items-center justify-center py-2 px-3 border-b border-r border-[#e6eef6]">
                    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
                      {row.level2}
                    </span>
                  </div>
                  <div className="w-[120px] min-w-[120px] flex items-center justify-center py-2 px-3 border-b border-r border-[#e6eef6]">
                    <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
                      {row.pageUrl}
                    </span>
                  </div>
                  {CRUD_KEYS.map((col, ci) => (
                    <div
                      key={col.key}
                      className={`flex-1 flex items-center justify-center py-2 px-3 border-b border-[#e6eef6] ${ci < CRUD_KEYS.length - 1 ? "border-r" : ""}`}
                    >
                      <Checkbox
                        checked={row[col.key]}
                        onChange={() => toggleCell(row.menuCode, col.key)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className="popup-buttons--inline">
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
