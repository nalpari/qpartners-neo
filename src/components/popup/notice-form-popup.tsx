"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, Checkbox, InputBox, DatePicker } from "@/components/common";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";
import type { NoticeFormData } from "@/components/admin/notices/notices-types";
import { targetsToPayload } from "@/components/admin/notices/notices-types";
import api from "@/lib/axios";

// Design Ref: §5 — TARGET_OPTIONS API value 통일

const CLOSE_ANIMATION_MS = 200;

const TARGET_OPTIONS = [
  { value: "super_admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
  { value: "first_store", label: "1次店" },
  { value: "second_store", label: "2次店以下" },
  { value: "seko", label: "施工店" },
  { value: "general", label: "一般会員" },
];

interface FormErrors {
  targets?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  content?: string;
  url?: string;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  // ISO 문자열은 직접 파싱, "2026.03.14" 형식은 dot→dash 치환 후 파싱
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  const replaced = new Date(str.replace(/\./g, "-"));
  return isNaN(replaced.getTime()) ? null : replaced;
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

export function NoticeFormPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const mode = (popupData.mode as "create" | "edit") ?? "create";
  const initialData = popupData.notice as NoticeFormData | undefined;
  const noticeId = initialData?.id;

  // RBAC Phase 3 — mode 별 canCreate/canUpdate 로 저장 가드.
  const noticesPerm = useMenuPermission(ADMIN_MENU.NOTICES);

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

  // Design Ref: §3 — 프론트 폼 검증
  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (targets.length === 0) errs.targets = "掲示対象を1つ以上選択してください";
    if (!startDate) errs.startDate = "開始日を選択してください";
    if (!endDate) errs.endDate = "終了日を選択してください";
    if (startDate && endDate && startDate >= endDate) {
      errs.dateRange = "開始日は終了日より前に設定してください";
    }
    if (!content.trim()) errs.content = "お知らせ内容を入力してください";
    if (url && !url.startsWith("https://")) {
      errs.url = "URLはhttps://で始めてください";
    }
    return errs;
  }

  // Design Ref: §4.1 — 등록 mutation
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post("/home-notices", payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      openAlert({ type: "alert", message: "登録しました。", confirmLabel: "確認" });
      closePopup();
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        const data = error.response.data;
        const msg = typeof data === "object" && data !== null && "error" in data && typeof (data as Record<string, unknown>).error === "string"
          ? (data as Record<string, unknown>).error as string
          : "";
        if (msg === "同一期間に掲載できるお知らせは5件までです") {
          openAlert({
            type: "alert",
            message: "活性(予定含む)のお知らせが5件を超えることはできません。",
            confirmLabel: "確認",
          });
          return;
        }
      }
      openAlert({ type: "alert", message: "登録に失敗しました。", confirmLabel: "確認" });
    },
  });

  // Design Ref: §4.2 — 수정 mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.put(`/home-notices/${noticeId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      openAlert({ type: "alert", message: "保存しました。", confirmLabel: "確認" });
      closePopup();
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 400) {
        const data = error.response.data;
        const msg = typeof data === "object" && data !== null && "error" in data && typeof (data as Record<string, unknown>).error === "string"
          ? (data as Record<string, unknown>).error as string
          : "";
        if (msg === "同一期間に掲載できるお知らせは5件までです") {
          openAlert({
            type: "alert",
            message: "活性(予定含む)のお知らせが5件を超えることはできません。",
            confirmLabel: "確認",
          });
          return;
        }
      }
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Design Ref: §4.3 — handleSave 통합
  const handleSave = () => {
    const needPerm = mode === "create" ? noticesPerm.canCreate : noticesPerm.canUpdate;
    if (!noticesPerm.isLoading && !needPerm) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    const payload = {
      ...targetsToPayload(targets),
      startAt: startDate!.toISOString(),
      endAt: endDate!.toISOString(),
      content: content.trim(),
      url: url.trim() || null,
    };

    if (mode === "create") {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  };

  const toggleTarget = (value: string, checked: boolean) => {
    setTargets(checked ? [...targets, value] : targets.filter((t) => t !== value));
  };

  const errorText = "font-['Noto_Sans_JP'] text-[12px] text-[#FF1A1A] mt-1";

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
            {errors.targets && <p className={errorText}>{errors.targets}</p>}
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
            {errors.startDate && <p className={errorText}>{errors.startDate}</p>}
            {errors.endDate && <p className={errorText}>{errors.endDate}</p>}
            {errors.dateRange && <p className={errorText}>{errors.dateRange}</p>}
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
            {errors.content && <p className={errorText}>{errors.content}</p>}
          </div>

          {/* URL */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              URL
            </label>
            <InputBox value={url} onChange={setUrl} placeholder="" />
            {errors.url && <p className={errorText}>{errors.url}</p>}
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
                  {formatDateTime(initialData?.createdAt)}
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
                  {formatDateTime(initialData?.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* 버튼 */}
          <div className="popup-buttons--inline">
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
