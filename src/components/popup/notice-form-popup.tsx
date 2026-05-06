"use client";

import { useState, useMemo } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, Checkbox, InputBox, DatePicker } from "@/components/common";
import type { NoticeFormData } from "@/components/admin/notices/notices-types";
import { targetsToPayload, formatUserLabel } from "@/components/admin/notices/notices-types";
import api from "@/lib/axios";
import { useTargetLabels } from "@/hooks/use-target-labels";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";

// Design Ref: §5 — TARGET_OPTIONS API value 통일

const CLOSE_ANIMATION_MS = 200;
const CONTENT_MAX_LENGTH = 200;

// 응답 메타 스키마 — POST/PUT 응답의 메타 필드 검증.
// `as Record<string, unknown>` 단언 대신 safeParse 로 타입 안전성 확보.
const noticeMetaSchema = z.object({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  createdBy: z.string().optional(),
  updatedAt: z.string().optional(),
  // updatedBy 는 명시적으로 null 가능 (등록 직후 미갱신 상태)
  updatedBy: z.string().nullable().optional(),
});

type NoticeMeta = z.infer<typeof noticeMetaSchema>;

/** QpRole 관리 대상 아닌 고정 옵션 — 항상 노출 */
const FIXED_TARGET_OPTIONS = [
  { value: "super_admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
];

interface FormErrors {
  targets?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  title?: string;
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

  // RBAC 표준 패턴 — ADM_NOTICE 매트릭스 가드. mode 별로 필요한 액션 분기.
  // 로딩 중 fail-closed (isPermLoading 시 비활성). 서버 API 도 requireMenuPermission 으로 최종 검증.
  const {
    canCreate: canCreateNotice,
    canUpdate: canUpdateNotice,
    canDelete: canDeleteNotice,
    isLoading: isPermLoading,
  } = useMenuPermission(ADMIN_MENU.NOTICES);

  // 게시대상 옵션 — QpRole.isActive=Y 만 동적 노출 + 고정 옵션(super_admin/admin)
  const { allOptions } = useTargetLabels();
  const targetOptions = useMemo(() => [
    ...FIXED_TARGET_OPTIONS,
    ...allOptions
      .filter((o) => o.isActive)
      .map((o) => ({ value: o.value, label: o.label })),
  ], [allOptions]);

  const initialData = popupData.notice as NoticeFormData | undefined;

  // mode/noticeId/메타데이터를 state 로 보유 — Issue #2146
  // 신규 등록(POST) 성공 시 closePopup 대신 mode→edit 로 전환하고 메타데이터(등록일/등록자/갱신일/갱신자)를
  // 응답 데이터로 갱신해야 사용자가 동일 팝업에서 추가 수정·재저장 가능.
  const [mode, setMode] = useState<"create" | "edit">(
    (popupData.mode as "create" | "edit") ?? "create",
  );
  const [noticeId, setNoticeId] = useState<number | undefined>(initialData?.id);

  const [targets, setTargets] = useState<string[]>(initialData?.targets ?? []);
  const [startDate, setStartDate] = useState<Date | null>(parseDate(initialData?.startDate ?? ""));
  const [endDate, setEndDate] = useState<Date | null>(parseDate(initialData?.endDate ?? ""));
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [url, setUrl] = useState(initialData?.url ?? "");

  // 표시 메타 — 등록자/등록일/갱신자/갱신일. Issue #2146 (2)(3)
  // create 모드 진입 시 createdAt 미리 채우지 않음 → 폼이 표시하는 등록일이 실제 DB 저장 시각과 어긋나는 문제 차단.
  // 저장 응답 후 응답 데이터(notice.createdAt 등)로 갱신. author/updater 이름은 응답 본문에 포함되지
  // 않으므로(QSP 외부 호출 회피) 초기값 그대로 const 유지 — 페이지 새로고침 시 list API 가 정식으로 해결.
  const author = initialData?.author ?? "";
  const [authorId, setAuthorId] = useState(initialData?.authorId ?? "");
  const [createdAt, setCreatedAt] = useState(initialData?.createdAt ?? "");
  const [updater, setUpdater] = useState(initialData?.updater ?? "");
  const [updaterId, setUpdaterId] = useState(initialData?.updaterId ?? "");
  const [updatedAt, setUpdatedAt] = useState(initialData?.updatedAt ?? "");

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
    // Issue #2176 (2) — 동일 날짜 선택 가능 (`>=` → `>`).
    if (startDate && endDate && startDate > endDate) {
      errs.dateRange = "開始日は終了日より前に設定してください";
    }
    if (!title.trim()) errs.title = "タイトルを入力してください";
    else if (title.length > 100) errs.title = "タイトルは100文字以内で入力してください";
    if (!content.trim()) errs.content = "お知らせ内容を入力してください";
    // Issue #2146 (1) — 내용 200자 제한 (BE createHomeNoticeSchema/updateHomeNoticeSchema 와 일치).
    else if (content.length > CONTENT_MAX_LENGTH)
      errs.content = `お知らせ内容は${CONTENT_MAX_LENGTH}文字以内で入力してください`;
    // BE 스키마(createHomeNoticeSchema/updateHomeNoticeSchema) 와 일치 — http(s) 모두 허용.
    if (url && !/^https?:\/\//.test(url)) {
      errs.url = "URLはhttp:// または https:// で始めてください";
    }
    return errs;
  }

  // 400 응답 body 에서 code 추출 — BE 가 LIMIT_EXCEEDED 등 식별자를 동봉.
  // 메시지 문자열 매칭은 번역/메시지 수정 시 깨지므로 code 기반 분기로 전환.
  const isLimitExceeded = (error: unknown): boolean => {
    if (!isAxiosError(error)) return false;
    if (error.response?.status !== 400) return false;
    const data = error.response.data;
    if (typeof data !== "object" || data === null) return false;
    const code = (data as Record<string, unknown>).code;
    return code === "LIMIT_EXCEEDED";
  };

  // 응답 body 형태: `{ data: notice }`. notice 의 메타데이터(createdAt 등)를 폼 표시값에 반영한다.
  // PII/외부 API 호출(QSP 이름 조회) 회피를 위해 이름은 응답으로 받지 않으므로, 본인 자신이 등록자인
  // 신규 등록 직후엔 이름 미해결 상태(authorId 만 표시) — 다음 페이지 새로고침 시 정확히 표시됨.
  // skipAuthor: PUT 응답 시 등록자/등록일은 갱신하지 않음 (authorId 만 바뀌고 author 이름은 그대로 남는 비대칭 방지).
  const applyNoticeMeta = (raw: unknown, opts?: { skipAuthor?: boolean }): NoticeMeta | null => {
    const parsed = noticeMetaSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[NoticeFormPopup] 응답 메타 스키마 불일치:", parsed.error.issues);
      return null;
    }
    const r = parsed.data;
    if (!opts?.skipAuthor) {
      if (typeof r.createdAt === "string") setCreatedAt(r.createdAt);
      // createdBy 가 등록자ID 단일 진실 원천 — userId fallback 제거.
      if (typeof r.createdBy === "string") setAuthorId(r.createdBy);
    }
    // 갱신자/갱신일은 한 쌍 — updatedBy 가 null 이면 갱신 이력 없음으로 갱신일도 비운다.
    // Prisma @updatedAt 이 INSERT 시 createdAt 과 동일 시각으로 자동 채워지면서 최초 저장 직후
    // 갱신일에 등록일과 같은 값이 표시되던 문제 해결 (Redmine #2175).
    // updatedBy === undefined 케이스(응답 키 누락)는 기존 표시값 유지(stale 방지) 가 아닌
    // 명시적 초기화 — Zod 가 nullable().optional() 이라 키가 빠지면 undefined 로 도달하므로
    // 이전 회차의 값이 남아 화면에 잘못 표시되는 회귀를 PR #130 리뷰 후속으로 차단.
    if (r.updatedBy === null || r.updatedBy === undefined) {
      setUpdaterId("");
      setUpdater("");
      setUpdatedAt("");
    } else {
      setUpdaterId(r.updatedBy);
      if (typeof r.updatedAt === "string") setUpdatedAt(r.updatedAt);
    }
    return r;
  };

  // Design Ref: §4.1 — 등록 mutation. Issue #2146 (3) — 저장 후 팝업 유지 + 메타 갱신.
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post("/home-notices", payload);
      return res.data;
    },
    onSuccess: (response: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      // 응답 데이터로 등록일/등록자 갱신 후 mode=edit 로 전환 → 사용자가 동일 팝업에서 추가 수정 가능.
      const notice = (response as { data?: unknown } | undefined)?.data;
      const meta = applyNoticeMeta(notice);
      // 본인이 등록자 → 갱신자 표시는 비워둠 (DB 에 updatedBy null).
      setUpdater("");
      setUpdaterId("");
      // id 가 응답에 정상 포함된 경우에만 edit 모드 전환 — 누락 시 후속 PUT 이 /home-notices/undefined 로
      // 호출되는 잠재 버그 차단. id 누락 시 list refetch 를 통해 사용자에게 결과만 알린다.
      if (typeof meta?.id === "number") {
        setNoticeId(meta.id);
        setMode("edit");
      }
      openAlert({ type: "alert", message: "登録しました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      if (isLimitExceeded(error)) {
        openAlert({
          type: "alert",
          message: "活性(予定含む)のお知らせが5件を超えることはできません。",
          confirmLabel: "確認",
        });
        return;
      }
      openAlert({ type: "alert", message: "登録に失敗しました。", confirmLabel: "確認" });
    },
  });

  // Design Ref: §4.2 — 수정 mutation. Issue #2146 (3) — 저장 후 팝업 유지 + 메타 갱신.
  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.put(`/home-notices/${noticeId}`, payload);
      return res.data;
    },
    onSuccess: (response: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      const notice = (response as { data?: unknown } | undefined)?.data;
      // PUT 응답에서는 등록자/등록일을 갱신하지 않음 — authorId 만 바뀌고 author(이름) 은 그대로 남는 비대칭 방지.
      applyNoticeMeta(notice, { skipAuthor: true });
      openAlert({ type: "alert", message: "保存しました。", confirmLabel: "確認" });
    },
    onError: (error: unknown) => {
      if (isLimitExceeded(error)) {
        openAlert({
          type: "alert",
          message: "活性(予定含む)のお知らせが5件を超えることはできません。",
          confirmLabel: "確認",
        });
        return;
      }
      openAlert({ type: "alert", message: "保存に失敗しました。", confirmLabel: "確認" });
    },
  });

  // 단건 삭제 mutation — 팝업 하단 削除 버튼에서 사용. confirm 후에만 호출.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/home-notices/${noticeId}`);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-notices"], refetchType: "all" });
      openAlert({ type: "alert", message: "削除しました。", confirmLabel: "確認" });
      closePopup();
    },
    onError: (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 403) {
        openAlert({
          type: "alert",
          message: "このお知らせを削除する権限がありません。",
          confirmLabel: "確認",
        });
        return;
      }
      openAlert({ type: "alert", message: "削除に失敗しました。", confirmLabel: "確認" });
    },
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  // 삭제 버튼 클릭 — confirm 후에만 실제 삭제 mutation 호출.
  const handleDelete = () => {
    if (!noticeId) return;
    openAlert({
      type: "confirm",
      message: "本当に削除してもよろしいですか？",
      confirmLabel: "削除",
      cancelLabel: "キャンセル",
      onConfirm: () => deleteMutation.mutate(),
    });
  };

  // Issue #2176 (1) — 과거일자 차단. alert 으로 즉시 알림.
  // 오늘 자정 기준 비교 — 시작/종료 어느 쪽이든 과거면 차단.
  const isPastDate = (d: Date | null): boolean => {
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };

  // Design Ref: §4.3 — handleSave 통합
  const handleSave = () => {
    if (isPastDate(startDate) || isPastDate(endDate)) {
      openAlert({
        type: "alert",
        message: "過去の日付は選択できません。",
        confirmLabel: "確認",
      });
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    // validate() 통과 후라도 TS 가 union 좁혀주지 않으므로 명시적 가드 — non-null 단언 제거.
    if (!startDate || !endDate) {
      setErrors({ dateRange: "開始日と終了日を選択してください" });
      return;
    }
    setErrors({});

    const payload = {
      ...targetsToPayload(targets),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      title: title.trim(),
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
              {targetOptions.map((opt) => (
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

          {/* 타이틀 */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              タイトル<span className="text-[#FF1A1A]">*</span>
            </label>
            <InputBox value={title} onChange={setTitle} placeholder="" />
            {errors.title && <p className={errorText}>{errors.title}</p>}
          </div>

          {/* 공지내용 — IME(일본어/한국어) 조합 입력 잘림 방지를 위해 textarea maxLength 미사용.
              200자 제한은 validate() + BE Zod 스키마(createHomeNoticeSchema/updateHomeNoticeSchema) 로 강제. */}
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
            <div className="flex items-center justify-between">
              {errors.content ? (
                <p className={errorText}>{errors.content}</p>
              ) : (
                <span />
              )}
              <span
                className={`font-['Noto_Sans_JP'] text-[12px] ${
                  content.length > CONTENT_MAX_LENGTH ? "text-[#FF1A1A]" : "text-[#999]"
                }`}
                aria-live="polite"
              >
                {content.length}/{CONTENT_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* URL */}
          <div className="flex flex-col gap-3">
            <label className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010]">
              URL
            </label>
            <InputBox value={url} onChange={setUrl} placeholder="" />
            {errors.url && <p className={errorText}>{errors.url}</p>}
          </div>

          {/* 하단 정보 — Issue #2146 (2)(3) state 기반 표시. 응답 후 mutation onSuccess 에서 갱신. */}
          <div className="flex flex-wrap gap-[18px]">
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">登録者</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {formatUserLabel(author, authorId)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">登録日</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {formatDateTime(createdAt)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">更新者</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {formatUserLabel(updater, updaterId)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F]">更新日</span>
              <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
                  {formatDateTime(updatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* 버튼 — 순서: キャンセル → 削除(edit 모드만) → 保存 */}
          {/* RBAC 표준 패턴 B — 매트릭스 가드 + 로딩 중 fail-closed. 서버 API 가 최종 방어선. */}
          <div className="popup-buttons--inline">
            <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
              キャンセル
            </Button>
            {mode === "edit" && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={isSaving || isPermLoading || !canDeleteNotice}
              >
                {deleteMutation.isPending ? "削除中..." : "削除"}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={
                isSaving ||
                isPermLoading ||
                (mode === "create" ? !canCreateNotice : !canUpdateNotice)
              }
            >
              {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
