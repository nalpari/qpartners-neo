"use client";

import { useMemo, useState } from "react";

import { Button, InputBox, Radio, SelectBox } from "@/components/common";

import {
  getInitialForm,
  type ProductCategoryOption,
  type ProductModelFormState,
  type ProductModelItem,
} from "./product-models-types";

interface ProductModelsDetailProps {
  /** 편집 대상. null 이면 신규 입력 상태 */
  selectedModel: ProductModelItem | null;
  categoryOptions: ProductCategoryOption[];
  /** 사용중지 카테고리의 표시명 — 편집 대상이 그런 카테고리에 붙어 있을 때만 쓴다 */
  inactiveLabels: Map<number, string>;
  isSaving: boolean;
  // RBAC 표준 패턴 — 부모가 useMenuPermission 단일 호출 후 prop 주입.
  // 자식이 별도 호출하면 isLoading 타이밍 차이로 readonly→edit 깜빡임이 생긴다.
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isPermLoading: boolean;
  onSave: (form: ProductModelFormState) => void;
  onDelete: () => void;
  onNew: () => void;
  onReset: () => void;
}

/**
 * 형번 등록·편집 폼 — 목업 03 `型番情報` 카드.
 *
 * 필드 4개 (`型番` / `カテゴリ` / `表示順序` / `表示／非表示`), 버튼 4개
 * (`削除` `初期化` `新規` `保存`). 버튼을 카드 머리에 두는 것은 목업 주석대로
 * 카테고리관리와 같은 배치다 — 폼이 길어질 때 하단 버튼이 화면 밖으로 밀려
 * 「저장이 없다」 로 보이는 것을 막는다.
 *
 * 폼 상태는 `key` 리마운트로 재초기화한다 (부모가 `editingId`+`resetToken` 으로 key 구성).
 */
export function ProductModelsDetail({
  selectedModel,
  categoryOptions,
  inactiveLabels,
  isSaving,
  canCreate,
  canUpdate,
  canDelete,
  isPermLoading,
  onSave,
  onDelete,
  onNew,
  onReset,
}: ProductModelsDetailProps) {
  const [form, setForm] = useState<ProductModelFormState>(() =>
    getInitialForm(selectedModel),
  );

  const isEditMode = selectedModel !== null;

  // RBAC — 신규 입력 중이면 create, 편집 중이면 update 가 저장 권한이다.
  const canSaveByPerm = isEditMode ? canUpdate : canCreate;
  // 권한 없으면 입력 자체를 막는다 (저장 버튼만 숨기는 부분 적용 금지).
  const isFormDisabled = isPermLoading || (isEditMode ? !canUpdate : !canCreate);

  /**
   * 카테고리 선택지.
   *
   * 기본 선택지는 **사용중 + 제품일람 ON** 2Depth 뿐이다(목업 `fillCategorySelects`).
   * 다만 편집 대상이 그 사이 사용중지된 카테고리에 붙어 있을 수 있어, 그 경우에만
   * 현재 값을 목록 앞에 끼워 넣는다 — 넣지 않으면 select 가 빈 값으로 보이고
   * 저장 시 운영자가 의도하지 않은 카테고리로 옮겨진다.
   */
  const selectOptions = useMemo(() => {
    if (form.categoryId === null) return categoryOptions;
    const key = String(form.categoryId);
    if (categoryOptions.some((o) => o.value === key)) return categoryOptions;
    const label = inactiveLabels.get(form.categoryId);
    if (!label) return categoryOptions;
    return [{ value: key, label: `${label}（使用 N）` }, ...categoryOptions];
  }, [form.categoryId, categoryOptions, inactiveLabels]);

  const updateField = <K extends keyof ProductModelFormState>(
    key: K,
    value: ProductModelFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="flex min-w-0 flex-[4] flex-col gap-[18px] self-stretch bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[24px] pb-[24px]">
      {/* Header + Buttons */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] text-[16px] font-medium text-[#45576f]">
          型番情報
        </h2>
        <div className="flex items-center gap-[6px]">
          {/* 削除 — RBAC 패턴 A (canDelete=false 시 미노출) */}
          {!isPermLoading && canDelete && (
            <Button variant="secondary" disabled={!isEditMode || isSaving} onClick={onDelete}>
              削除
            </Button>
          )}
          {/* 初期化 — 폼 state 만 되돌린다 (편집 대상은 유지). RBAC 비대상 */}
          <Button variant="secondary" onClick={onReset}>
            初期化
          </Button>
          {/* 新規 — 편집 대상을 해제하고 빈 폼으로 (RBAC 패턴 A) */}
          {!isPermLoading && canCreate && (
            <Button variant="point" onClick={onNew}>
              新規
            </Button>
          )}
          {/* 保存 — 핸들러 본체 가드는 부모(handleSave) */}
          {!isPermLoading && canSaveByPerm && (
            <Button variant="primary" disabled={isSaving} onClick={() => onSave(form)}>
              保存
            </Button>
          )}
        </div>
      </div>

      {/* Form Rows */}
      <div className="flex flex-col gap-[4px]">
        <FormRow label="型番" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={form.modelCode}
              onChange={(val) => updateField("modelCode", val)}
              placeholder="例）HQJP-A44-1"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        <FormRow label="カテゴリ" required>
          <div className="w-full p-[8px]">
            <SelectBox
              options={selectOptions}
              value={form.categoryId !== null ? String(form.categoryId) : ""}
              onChange={(val) => updateField("categoryId", val ? Number(val) : null)}
              placeholder="選択してください"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* 製品ステータス — REQ-007 관리 항목. 목업 `03-admin-models.html:318` 의 `modelStatus`
            라디오와 같이 **미선택으로 시작**하고 저장 시 선택을 강제한다. 기본값을 現行品 으로
            깔면 단종품을 現行品 으로 저장하는 사고가 조용히 생긴다.
            자료일람의 제품상태는 이 값에서 파생된다(REQ-005) — 자료 쪽에는 입력란이 없다. */}
        <FormRow label="製品ステータス" required>
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.status === "current"}
              onChange={() => updateField("status", "current")}
              label="現行品"
              name="status"
              disabled={isFormDisabled}
            />
            <Radio
              checked={form.status === "eol"}
              onChange={() => updateField("status", "eol")}
              label="販売終了品"
              name="status"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        <FormRow label="型番順序">
          <div className="w-full p-[8px]">
            <InputBox
              value={String(form.sortOrder)}
              onChange={(val) => updateField("sortOrder", Number(val) || 0)}
              type="number"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* 表示／非表示 — 목업과 같이 **미선택으로 시작**하고 저장 시 선택을 강제한다.
            기본값을 Y 로 깔면 운영자가 의식하지 않은 채 공개 상태로 저장된다. */}
        <FormRow label="表示／非表示" required>
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.isVisible === true}
              onChange={() => updateField("isVisible", true)}
              label="Y"
              name="isVisible"
              disabled={isFormDisabled}
            />
            <Radio
              checked={form.isVisible === false}
              onChange={() => updateField("isVisible", false)}
              label="N"
              name="isVisible"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>
      </div>

      <p className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">
        ※一覧の行をクリックすると、その型番の編集に切り替わります。
      </p>
    </section>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start w-full gap-[4px]">
      <div className="flex items-center w-[160px] min-h-[58px] pl-[16px] pr-[8px] bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] shrink-0">
        <span className="font-['Noto_Sans_JP'] text-[14px] font-medium text-[#45576f] whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
          {required && <span className="text-[#ff1a1a]">*</span>}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-[58px] border border-[#eaf0f6] rounded-[6px] py-[4px]">
        {children}
      </div>
    </div>
  );
}
