"use client";

// Design Ref: §4.3 — 우측 카테고리 상세 편집 폼
// AutoCompleteSelect + 자동채번 + isSaving

import { useState } from "react";
import { Button, Checkbox, InputBox, Radio } from "@/components/common";
import { AutoCompleteSelect } from "./auto-complete-select";
import type { CategoryNode, CategoryFormState } from "./categories-types";
import {
  generateChildCode,
  resolveInternalOnlyValue,
  resolveProductListValue,
} from "./categories-types";

interface CategoriesDetailProps {
  selectedCategory: CategoryNode | null;
  parentOptions: { label: string; value: string }[];
  treeData: CategoryNode[];
  isNewMode: boolean;
  isSaving: boolean;
  // RBAC 표준 패턴 — 부모(CategoriesContents) 가 useMenuPermission 단일 호출 후 prop 으로 전달.
  // 자식이 별도 호출하면 부모/자식 isLoading 타이밍 차이로 readonly→edit→readonly 깜빡임 발생 가능.
  // 서버 API 도 requireMenuPermission(ADM_CATEGORY, ...) 로 최종 검증 — FE 는 UX 일관성 전용.
  // mode (isNewMode) 별로 create/update 가드가 달라지므로 자식 내부에서 isFormDisabled 파생.
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isPermLoading: boolean;
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
  isVisible: true,
  isProductList: false,
};

function getInitialForm(category: CategoryNode | null): CategoryFormState {
  if (!category) return INITIAL_FORM;
  return {
    // 1Depth 는 자식 전원 Y 일 때만 Y — 트리 컬럼 표시값과 라디오 상태를 일치시킨다
    isInternalOnly: resolveInternalOnlyValue(category),
    parentId: category.parentId,
    categoryCode: category.categoryCode,
    name: category.name,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    isVisible: category.isVisible,
    // 1Depth 는 자식 전원 Y 일 때만 Y — 트리 컬럼 표시값과 체크 상태를 일치시킨다
    isProductList: resolveProductListValue(category),
  };
}

export function CategoriesDetail({
  selectedCategory,
  parentOptions,
  treeData,
  isNewMode,
  isSaving,
  canCreate,
  canUpdate,
  canDelete,
  isPermLoading,
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

  // RBAC — mode 별로 필요한 액션 분기. 신규(isNewMode)면 create, 수정이면 update.
  const canSaveByPerm = isNewMode ? canCreate : canUpdate;
  // 입력 필드 disabled 통일 — canUpdate=false 면 모든 폼 입력 차단 (저장 버튼만 막는 부분 적용 금지).
  // 신규 모드는 canCreate 가 일차 가드, 수정 모드는 canUpdate 가 일차 가드.
  const isFormDisabled =
    isPermLoading || (isNewMode ? !canCreate : !canUpdate);

  // Design Ref: §4.3 — categoryCode 비활성화 조건
  const isCodeDisabled = isEditMode || form.parentId !== null || isFormDisabled;

  // 1Depth 의 `社内会員専用`·`製品一覧表示` 는 **하위 전체 선택 토글**이다 — 저장 시 서버가 하위 2Depth
  // 전체에 같은 값을 전파한다(PUT /api/categories/:id). 형번은 2Depth 에만 붙으므로
  // 1Depth 자체 값은 기능에 쓰이지 않고, 이 토글이 유일한 용도다.
  // 자식이 0건이면 전파할 대상이 없어 안내 문구가 사실과 어긋난다 — 그때는 띄우지 않는다.
  // `社内会員専用` 도 같은 조건으로 안내 문구를 띄운다 (2026-10-23 규칙 통일).
  const isParentToggle = depth === 1 && (selectedCategory?.children.length ?? 0) > 0;
  const isProductListParentToggle = isParentToggle;

  const updateField = <K extends keyof CategoryFormState>(
    key: K,
    value: CategoryFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Design Ref: §4.3 — parentId 변경 시 자동채번
  //
  // `社内会員専用`·`製品一覧表示` 는 **부모 값을 초기값으로 상속**한다 (목업 04: 「2Depth は親の
  // 『製品一覧表示』を初期値として引き継ぐ（変更可）」). 상속하는 값은 트리에 보이는
  // 파생값 — 운영자가 화면에서 본 값과 상속되는 값이 어긋나지 않게 한다.
  const handleParentChange = (parentId: number | null) => {
    if (parentId === null) {
      setForm((prev) => ({ ...prev, parentId, categoryCode: "" }));
    } else {
      const parent = treeData.find((p) => p.id === parentId);
      if (parent) {
        const autoCode = generateChildCode(parent.categoryCode, parent.children);
        setForm((prev) => ({
          ...prev,
          parentId,
          categoryCode: autoCode,
          isInternalOnly: resolveInternalOnlyValue(parent),
          isProductList: resolveProductListValue(parent),
        }));
      } else {
        setForm((prev) => ({ ...prev, parentId }));
      }
    }
  };

  return (
    <section className="flex min-w-0 flex-[4] flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] px-[24px] pb-[24px] overflow-hidden self-stretch">
      {/* Header + Buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-medium text-[#45576f] font-['Noto_Sans_JP']">
          カテゴリ情報
        </h2>
        <div className="flex items-center gap-[6px]">
          {/* 削除 — RBAC 패턴 A (canDelete=false 시 미노출). #2183 note-12 통일 */}
          {!isPermLoading && canDelete && (
            <Button
              variant="secondary"
              disabled={!isEditMode || isSaving}
              onClick={onDelete}
            >
              削除
            </Button>
          )}
          {/* 初期化 — 폼 state reset 만 수행, RBAC 비대상 (read 영역) */}
          <Button variant="secondary" onClick={onReset}>
            初期化
          </Button>
          {/* 新規 — RBAC 패턴 A (canCreate=false 시 미노출) */}
          {!isPermLoading && canCreate && (
            <Button
              variant="point"
              onClick={onNew}
            >
              新規
            </Button>
          )}
          {/* 保存 — RBAC 패턴 A (mode 별 분기 미노출). 핸들러 본체 패턴 E 는 부모(handleSave). */}
          {!isPermLoading && canSaveByPerm && (
            <Button
              variant="primary"
              disabled={!hasSelection || isSaving}
              onClick={() => onSave(form)}
            >
              保存
            </Button>
          )}
        </div>
      </div>

      {/* Form Rows */}
      <div className="flex flex-col gap-[4px]">
        {/* Row 1: 製品一覧表示 — REQ-008. 켜면 검색화면 제품일람 탭의 `型番` 축과
            형번관리의 카테고리 선택지에 나타난다. 형번은 2Depth 에만 붙으므로,
            1Depth 의 체크는 하위 전체에 적용되는 토글이다. */}
        <FormRow
          label="製品一覧表示"
          note={
            isProductListParentToggle
              ? "下位カテゴリ全体に適用 · 下位項目に N がある場合、上位項目も N と表示"
              : isNewMode
                ? "親カテゴリ設定を初期値として適用 · 個別変更可能"
                : undefined
          }
          // 사용중지 카테고리의 형번은 제품일람 검색조건에서 제외된다 — 설정 자체는
          // 독립이므로 입력을 막지 않고 결과만 안내한다 (목업 `#inactiveNote`).
          warning={
            !form.isActive
              ? "※「使用」が N のため、製品一覧では選択できない状態（チェック解除・無効）で表示されます。"
              : undefined
          }
        >
          <div className="flex items-center gap-[12px] px-[24px]">
            <Checkbox
              checked={form.isProductList}
              onChange={(checked) => updateField("isProductList", checked)}
              label="製品一覧に表示する"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 2: 社内会員専用 — 1Depth 는 하위 전체 토글(製品一覧表示 와 같은 규칙,
            2026-10-23 통일). 2Depth 는 개별 편집 (RBAC readonly 시 비활성). */}
        <FormRow
          label="社内会員専用"
          required
          note={
            isParentToggle
              ? "下位カテゴリ全体に適用 · 下位項目に N がある場合、上位項目も N と表示"
              : isNewMode
                ? "親カテゴリ設定を初期値として適用 · 個別変更可能"
                : undefined
          }
        >
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.isInternalOnly}
              onChange={() => updateField("isInternalOnly", true)}
              label="Y"
              name="isInternalOnly"
              disabled={isFormDisabled}
            />
            <Radio
              checked={!form.isInternalOnly}
              onChange={() => updateField("isInternalOnly", false)}
              label="N"
              name="isInternalOnly"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 3: 親カテゴリ — AutoCompleteSelect. 수정 모드 또는 RBAC readonly 시 비활성 */}
        <FormRow label="親カテゴリ">
          <div className="w-full p-[8px]">
            <AutoCompleteSelect
              options={parentOptions}
              value={form.parentId !== null ? String(form.parentId) : ""}
              onChange={(val) => handleParentChange(val ? Number(val) : null)}
              placeholder="カテゴリ名で検索"
              disabled={isEditMode || isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 4: Depth */}
        <FormRow label="Depth">
          <div className="w-full p-[8px]">
            <InputBox value={String(depth)} readOnly />
          </div>
        </FormRow>

        {/* Row 5: カテゴリコード */}
        <FormRow label="カテゴリコード" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={form.categoryCode}
              onChange={(val) => updateField("categoryCode", val)}
              disabled={isCodeDisabled}
            />
          </div>
        </FormRow>

        {/* Row 6: カテゴリ名 */}
        <FormRow label="カテゴリ名" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={form.name}
              onChange={(val) => updateField("name", val)}
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 7: 表示順序 */}
        <FormRow label="表示順序" required>
          <div className="w-full p-[8px]">
            <InputBox
              value={String(form.sortOrder)}
              onChange={(val) => updateField("sortOrder", Number(val) || 0)}
              type="number"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 8: 使用 */}
        <FormRow label="使用" required>
          <div className="flex items-center gap-[12px] px-[24px]">
            <Radio
              checked={form.isActive}
              onChange={() => updateField("isActive", true)}
              label="Y"
              name="isActive"
              disabled={isFormDisabled}
            />
            <Radio
              checked={!form.isActive}
              onChange={() => updateField("isActive", false)}
              label="N"
              name="isActive"
              disabled={isFormDisabled}
            />
          </div>
        </FormRow>

        {/* Row 9: リスト表示 — 콘텐츠 목록 ag-grid 의 parent 카테고리 컬럼 노출 토글.
            1Depth 에만 적용되는 개념이므로 2Depth(자식) 카테고리에서는 영역 자체를 미노출. */}
        {depth === 1 && (
          <FormRow label="リスト表示" required>
            <div className="flex items-center gap-[12px] px-[24px]">
              <Radio
                checked={form.isVisible}
                onChange={() => updateField("isVisible", true)}
                label="Y"
                name="isVisible"
                disabled={isFormDisabled}
              />
              <Radio
                checked={!form.isVisible}
                onChange={() => updateField("isVisible", false)}
                label="N"
                name="isVisible"
                disabled={isFormDisabled}
              />
            </div>
          </FormRow>
        )}
      </div>

      <p className="text-[14px] text-[#101010] font-['Noto_Sans_JP']">
        ※カテゴリはDepth-2までのみ管理できます。
      </p>
    </section>
  );
}

function FormRow({
  label,
  required,
  note,
  warning,
  children,
}: {
  label: string;
  required?: boolean;
  /** 보조 설명 (상속·전파 범위 안내 등) */
  note?: string;
  /** 설정은 유효하지만 결과가 달라지는 상태에 대한 경고 */
  warning?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center w-full">
      <div className="flex items-center gap-[4px] w-full">
        <div className="flex items-center w-[160px] min-h-[58px] self-stretch pl-[16px] pr-[8px] bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] shrink-0">
          <span className="text-[14px] font-medium text-[#45576f] font-['Noto_Sans_JP'] whitespace-nowrap overflow-hidden text-ellipsis">
            {label}
            {required && <span className="text-[#ff1a1a]">*</span>}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center min-h-[58px] border border-[#eaf0f6] rounded-[6px] py-[4px]">
          {children}
          {note && (
            <p className="px-[24px] pt-[2px] text-[12px] text-[#6a88a9] font-['Noto_Sans_JP']">
              {note}
            </p>
          )}
          {warning && (
            <p className="px-[24px] pt-[2px] text-[12px] text-[#b42318] font-['Noto_Sans_JP']">
              {warning}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
