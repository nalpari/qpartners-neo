"use client";

// Design Ref: §4.3 — 우측 카테고리 상세 편집 폼
// AutoCompleteSelect + 자동채번 + isSaving

import { useState } from "react";
import { Button, InputBox, Radio } from "@/components/common";
import { AutoCompleteSelect } from "./auto-complete-select";
import type { CategoryNode, CategoryFormState } from "./categories-types";
import { generateChildCode } from "./categories-types";

interface CategoriesDetailProps {
  selectedCategory: CategoryNode | null;
  parentOptions: { label: string; value: string }[];
  treeData: CategoryNode[];
  isNewMode: boolean;
  isSaving: boolean;
  onSave: (form: CategoryFormState) => void;
  onDelete: () => void;
  onNew: () => void;
  onReset: () => void;
}

const INITIAL_FORM: CategoryFormState = {
  isInternalOnly: false,
  parentId: null,
  categoryCode: "",
  name: "",
  sortOrder: 1,
  isActive: true,
};

function getInitialForm(category: CategoryNode | null): CategoryFormState {
  if (!category) return INITIAL_FORM;
  return {
    isInternalOnly: category.isInternalOnly,
    parentId: category.parentId,
    categoryCode: category.categoryCode,
    name: category.name,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export function CategoriesDetail({
  selectedCategory,
  parentOptions,
  treeData,
  isNewMode,
  isSaving,
  onSave,
  onDelete,
  onNew,
  onReset,
}: CategoriesDetailProps) {
  // key prop으로 리마운트 제어 — useEffect 내 setState 대신 초기값으로 직접 설정
  const [form, setForm] = useState<CategoryFormState>(
    isNewMode ? INITIAL_FORM : getInitialForm(selectedCategory),
  );

  const isEditMode = selectedCategory !== null && !isNewMode;
  const hasSelection = selectedCategory !== null || isNewMode;
  const depth = form.parentId === null ? 1 : 2;

  // Design Ref: §4.3 — categoryCode 비활성화 조건
  const isCodeDisabled = isEditMode || form.parentId !== null;

  const updateField = <K extends keyof CategoryFormState>(
    key: K,
    value: CategoryFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Design Ref: §4.3 — parentId 변경 시 자동채번 + 사내전용 연동
  const handleParentChange = (parentId: number | null) => {
    if (parentId === null) {
      setForm((prev) => ({ ...prev, parentId, categoryCode: "" }));
    } else {
      const parent = treeData.find((p) => p.id === parentId);
      if (parent) {
        const autoCode = generateChildCode(parent.categoryCode, parent.children);
        // 2Depth는 부모의 사내전용 값을 따라감
        setForm((prev) => ({
          ...prev,
          parentId,
          categoryCode: autoCode,
          isInternalOnly: parent.isInternalOnly,
        }));
      } else {
        setForm((prev) => ({ ...prev, parentId }));
      }
    }
  };

  // 2Depth일 때 사내전용은 부모를 따라가므로 비활성화
  const isInternalOnlyDisabled = form.parentId !== null;

  return (
    <section className="flex-1 flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[24px] pb-[24px] overflow-hidden self-stretch">
      {/* Header + Buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-medium text-[#45576f] font-['Noto_Sans_JP']">
          カテゴリ情報
        </h2>
        <div className="flex items-center gap-[6px]">
          <Button
            variant="secondary"
            disabled={!isEditMode || isSaving}
            onClick={onDelete}
          >
            削除
          </Button>
          <Button variant="secondary" onClick={onReset}>
            初期化
          </Button>
          <Button variant="point" onClick={onNew}>
            新規
          </Button>
          <Button
            variant="primary"
            disabled={!hasSelection || isSaving}
            onClick={() => onSave(form)}
          >
            保存
          </Button>
        </div>
      </div>

      {/* Form Rows */}
      <div className="flex flex-col gap-[4px]">
        {/* Row 1: 社内会員専用 */}
        <FormRow label="社内会員専用" required>
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.isInternalOnly}
              onChange={() => !isInternalOnlyDisabled && updateField("isInternalOnly", true)}
              label="Y"
              name="isInternalOnly"
              disabled={isInternalOnlyDisabled}
            />
            <Radio
              checked={!form.isInternalOnly}
              onChange={() => !isInternalOnlyDisabled && updateField("isInternalOnly", false)}
              label="N"
              name="isInternalOnly"
              disabled={isInternalOnlyDisabled}
            />
          </div>
        </FormRow>

        {/* Row 2: 親カテゴリ — AutoCompleteSelect */}
        <FormRow label="親カテゴリ">
          <div className="w-full p-[8px]">
            <AutoCompleteSelect
              options={parentOptions}
              value={form.parentId !== null ? String(form.parentId) : ""}
              onChange={(val) => handleParentChange(val ? Number(val) : null)}
              placeholder="カテゴリ名で検索"
              disabled={isEditMode}
            />
          </div>
        </FormRow>

        {/* Row 3: Depth */}
        <FormRow label="Depth">
          <div className="w-full p-[8px]">
            <InputBox value={String(depth)} readOnly />
          </div>
        </FormRow>

        {/* Row 4: カテゴリコード */}
        <FormRow label="カテゴリコード" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={form.categoryCode}
              onChange={(val) => updateField("categoryCode", val)}
              disabled={isCodeDisabled}
            />
          </div>
        </FormRow>

        {/* Row 5: カテゴリ名 */}
        <FormRow label="カテゴリ名" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={form.name}
              onChange={(val) => updateField("name", val)}
            />
          </div>
        </FormRow>

        {/* Row 6: 表示順序 */}
        <FormRow label="表示順序" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={String(form.sortOrder)}
              onChange={(val) => updateField("sortOrder", Number(val) || 0)}
              type="number"
            />
          </div>
        </FormRow>

        {/* Row 7: 使用 */}
        <FormRow label="使用" required>
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.isActive}
              onChange={() => updateField("isActive", true)}
              label="Y"
              name="isActive"
            />
            <Radio
              checked={!form.isActive}
              onChange={() => updateField("isActive", false)}
              label="N"
              name="isActive"
            />
          </div>
        </FormRow>
      </div>

      <p className="text-[14px] text-[#101010] font-['Noto_Sans_JP']">
        ※カテゴリはDepth-2までのみ管理できます.
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
    <div className="flex items-center w-full">
      <div className="flex items-center gap-[4px] w-full">
        <div className="flex items-center w-[160px] h-[58px] pl-[16px] pr-[8px] bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] shrink-0">
          <span className="text-[14px] font-medium text-[#45576f] font-['Noto_Sans_JP'] whitespace-nowrap overflow-hidden text-ellipsis">
            {label}
            {required && <span className="text-[#ff1a1a]">*</span>}
          </span>
        </div>
        <div className="flex-1 flex items-center min-h-[58px] border border-[#eaf0f6] rounded-[6px]">
          {children}
        </div>
      </div>
    </div>
  );
}
