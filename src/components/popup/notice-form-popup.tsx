"use client";

import { useState } from "react";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, Checkbox, InputBox, DatePicker } from "@/components/common";
import type { NoticeFormData } from "@/components/admin/notices/notices-dummy-data";

const CLOSE_ANIMATION_MS = 200;

const TARGET_OPTIONS = [
  { value: "super-admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
  { value: "first-dealer", label: "1次店" },
  { value: "second-dealer", label: "2次店以下" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般会員" },
];

function parseDate(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str.replace(/\./g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

export function NoticeFormPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const [isClosing, setIsClosing] = useState(false);

  const mode = (popupData.mode as "create" | "edit") ?? "create";
  const initialData = popupData.notice as NoticeFormData | undefined;

  const [targets, setTargets] = useState<string[]>(initialData?.targets ?? []);
  const [startDate, setStartDate] = useState<Date | null>(parseDate(initialData?.startDate ?? ""));
  const [endDate, setEndDate] = useState<Date | null>(parseDate(initialData?.endDate ?? ""));
  const [content, setContent] = useState(initialData?.content ?? "");
  const [url, setUrl] = useState(initialData?.url ?? "");

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = () => {
    openAlert({
      type: "alert",
      message: mode === "create" ? "登録しました。" : "保存しました。",
      confirmLabel: "確認",
    });
  };

  const toggleTarget = (value: string, checked: boolean) => {
    setTargets(checked ? [...targets, value] : targets.filter((t) => t !== value));
  };

  return (
    <div className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}>
      <div
        className="popup-container !w-[900px] !max-w-[900px]"
        role="dialog"
        aria-modal="true"
        aria-label="ホーム画面公知"
      >
        <div className="popup-container__inner !gap-[24px]">
          {/* 타이틀 */}
          <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
            <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
              ホーム画面公知
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

          {/* 게시대상 */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              掲示対象<span className="text-[#FF1A1A]">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
              {TARGET_OPTIONS.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={targets.includes(opt.value)}
                  onChange={(checked) => toggleTarget(opt.value, checked)}
                  label={opt.label}
                />
              ))}
            </div>
          </div>

          {/* 공지기간 */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              掲示期間<span className="text-[#FF1A1A]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <DatePicker value={startDate} onChange={setStartDate} className="w-[200px]" />
              <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">~</span>
              <DatePicker value={endDate} onChange={setEndDate} className="w-[200px]" />
            </div>
          </div>

          {/* 공지내용 */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              お知らせ内容<span className="text-[#FF1A1A]">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[150px] p-4 border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.8] text-[#101010] outline-none bg-white hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
              style={{ resize: "none" }}
            />
          </div>

          {/* URL */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              URL
            </label>
            <InputBox value={url} onChange={setUrl} placeholder="" />
          </div>

          {/* 하단 정보 */}
          <div className="flex flex-wrap gap-[18px]">
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">登録者</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {initialData?.author ? `${initialData.author} (${initialData.authorId})` : "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">登録日</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {initialData?.createdAt || "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">更新者</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {initialData?.updater ? `${initialData.updater} (${initialData.updaterId})` : "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">更新日</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {initialData?.updatedAt || "—"}
                </span>
              </div>
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
