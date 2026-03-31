"use client";

import { useState } from "react";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, Checkbox } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

interface MenuPermissionItem {
  id: string;
  level1: string;
  level2: string;
  pageUrl: "Y" | null;
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

const DUMMY_MENU_PERMISSIONS: MenuPermissionItem[] = [
  { id: "M01", level1: "会員管理", level2: "", pageUrl: "Y", read: true, create: true, update: true, delete: true },
  { id: "M02", level1: "", level2: "会員一覧", pageUrl: "Y", read: true, create: false, update: true, delete: false },
  { id: "M03", level1: "", level2: "会員詳細", pageUrl: "Y", read: true, create: false, update: false, delete: false },
  { id: "M04", level1: "バルクメール", level2: "", pageUrl: "Y", read: true, create: true, update: false, delete: false },
  { id: "M05", level1: "", level2: "メール一覧", pageUrl: "Y", read: true, create: false, update: false, delete: false },
  { id: "M06", level1: "", level2: "メール登録", pageUrl: "Y", read: true, create: true, update: false, delete: false },
  { id: "M07", level1: "ホーム画面公知", level2: "", pageUrl: "Y", read: true, create: true, update: true, delete: true },
  { id: "M08", level1: "カテゴリ管理", level2: "", pageUrl: null, read: true, create: false, update: false, delete: false },
  { id: "M09", level1: "権限管理", level2: "", pageUrl: "Y", read: true, create: true, update: true, delete: true },
  { id: "M10", level1: "", level2: "権限設定", pageUrl: "Y", read: true, create: false, update: true, delete: false },
  { id: "M11", level1: "メニュー管理", level2: "", pageUrl: "Y", read: true, create: true, update: true, delete: false },
  { id: "M12", level1: "コード管理", level2: "", pageUrl: "Y", read: true, create: true, update: true, delete: true },
];

type CrudKey = "read" | "create" | "update" | "delete";
const CRUD_KEYS: { key: CrudKey; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

/** 헤더 셀 스타일 */
const TH = "flex items-center justify-center bg-[#506273] py-3 px-3 overflow-hidden font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#f5f5f5] whitespace-nowrap";

export function PermissionMenuPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const [isClosing, setIsClosing] = useState(false);
  const [rows, setRows] = useState<MenuPermissionItem[]>(DUMMY_MENU_PERMISSIONS);

  const permissionName = (popupData.permissionName as string) ?? "";

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = () => {
    openAlert({ type: "alert", message: "保存されました。", confirmLabel: "確認" });
  };

  const toggleCell = (id: string, key: CrudKey) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: !r[key] } : r))
    );
  };

  /** 컬럼별 전체/부분 체크 상태 계산 */
  const getColumnState = (key: CrudKey) => {
    const checked = rows.filter((r) => r[key]).length;
    if (checked === 0) return "none";
    if (checked === rows.length) return "all";
    return "some";
  };

  const toggleColumn = (key: CrudKey) => {
    const state = getColumnState(key);
    const newValue = state !== "all";
    setRows((prev) => prev.map((r) => ({ ...r, [key]: newValue })));
  };

  return (
    <div className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}>
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
              [{permissionName}] Menu Setting
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
              {rows.map((row, i) => (
                <div
                  key={row.id}
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
                        onChange={() => toggleCell(row.id, col.key)}
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
