"use client";

import { Button, InputBox, SelectBox, Radio } from "@/components/common";
import type { MenuFormState } from "./menus-types";

// Design Ref: §5.2 — DetailRow 패턴 (member-detail-popup.tsx 로컬 재정의)

function LabelCell({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="w-[160px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
        {required && <span className="text-[#FF1A1A] ml-1">*</span>}
      </span>
    </div>
  );
}

function FormCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center h-full bg-white border border-[#EAF0F6] rounded-[6px] p-2">
      {children}
    </div>
  );
}

function DetailRow({
  left,
  right,
}: {
  left: { label: string; required?: boolean; children: React.ReactNode };
  right?: { label: string; required?: boolean; children: React.ReactNode };
}) {
  return (
    <div className="flex gap-1 items-start">
      <div className="flex flex-1 gap-1 h-[58px] items-center">
        <LabelCell label={left.label} required={left.required} />
        <FormCell>{left.children}</FormCell>
      </div>
      {right && (
        <div className="flex flex-1 gap-1 h-[58px] items-center">
          <LabelCell label={right.label} required={right.required} />
          <FormCell>{right.children}</FormCell>
        </div>
      )}
    </div>
  );
}

interface SelectOption {
  label: string;
  value: string;
}

interface MenusInfoFormProps {
  form: MenuFormState;
  level1Options: SelectOption[];
  isEditing: boolean;
  isSaving: boolean;
  onFormChange: (field: keyof MenuFormState, value: string) => void;
  onNew: () => void;
  onSave: () => void;
  /** 삭제 버튼 클릭 — 폼에 바인딩된 메뉴(editingId) 를 대상으로 삭제 confirm 진행. */
  onDelete: () => void;
  /** 폼이 편집 모드(editingId 존재)일 때만 활성. 신규 모드에서는 비활성 처리. */
  isDeleteEnabled: boolean;
  isDeleting: boolean;
  // RBAC 표준 패턴 — 부모(MenusContents) 단일 호출 후 prop 으로 전달 (PR #148 리뷰 학습).
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isPermLoading: boolean;
}

export function MenusInfoForm({
  form,
  level1Options,
  isEditing,
  isSaving,
  onFormChange,
  onNew,
  onSave,
  onDelete,
  isDeleteEnabled,
  isDeleting,
  canCreate,
  canUpdate,
  canDelete,
  isPermLoading,
}: MenusInfoFormProps) {
  // mode 별 분기 — 편집 모드는 update, 신규 모드는 create.
  const canSaveByPerm = isEditing ? canUpdate : canCreate;
  // 폼 입력 비활성화 — RBAC 사유 (권한 없으면 readOnly 와 동치).
  // 저장 권한 없으면 입력 자체가 의미 없으므로 그대로 폼 비활성.
  const isFormDisabled =
    isPermLoading || (isEditing ? !canUpdate : !canCreate);
  return (
    <div className="flex flex-col gap-4">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
          メニュー情報
        </h2>
        <div className="flex items-center gap-2">
          {/* 新規 — RBAC 패턴 A (canCreate=false 시 미노출). #2183 note-12 통일 */}
          {!isPermLoading && canCreate && (
            <Button
              variant="outline"
              onClick={onNew}
              disabled={isSaving || isDeleting}
            >
              新規
            </Button>
          )}
          {/* 削除 — RBAC 패턴 A (canDelete=false 시 미노출). 핸들러 본체 패턴 E 는 부모에서. */}
          {!isPermLoading && canDelete && (
            <Button
              variant="secondary"
              onClick={onDelete}
              disabled={!isDeleteEnabled || isSaving || isDeleting}
            >
              {isDeleting ? "削除中..." : "削除"}
            </Button>
          )}
          {/* 保存 — RBAC 패턴 A (mode 별 분기 미노출). 핸들러 본체 패턴 E 는 부모에서. */}
          {!isPermLoading && canSaveByPerm && (
            <Button
              variant="primary"
              onClick={onSave}
              disabled={isSaving || isDeleting}
            >
              保存
            </Button>
          )}
        </div>
      </div>

      {/* 폼 행 */}
      <div className="flex flex-col gap-1">
        {/* 1행: Upper Menu + Menu Code */}
        <DetailRow
          left={{
            label: "Upper Menu 1-Level",
            children: (
              <SelectBox
                options={level1Options}
                value={form.upperMenu}
                onChange={(v) => onFormChange("upperMenu", v)}
                placeholder="選択してください"
                disabled={isEditing || isFormDisabled}
              />
            ),
          }}
          right={{
            label: "Menu Code",
            required: true,
            children: (
              <InputBox
                value={form.menuCode}
                onChange={(v) => onFormChange("menuCode", v)}
                readOnly={isEditing}
                disabled={isFormDisabled}
                placeholder="コード入力"
              />
            ),
          }}
        />

        {/* 2행: Menu Name + Page URL */}
        <DetailRow
          left={{
            label: "Menu Name",
            required: true,
            children: (
              <InputBox
                value={form.menuName}
                onChange={(v) => onFormChange("menuName", v)}
                placeholder="メニュー名入力"
                disabled={isFormDisabled}
              />
            ),
          }}
          right={{
            label: "Page URL",
            children: (
              <InputBox
                value={form.pageUrl}
                onChange={(v) => onFormChange("pageUrl", v)}
                placeholder="/path"
                disabled={isFormDisabled}
              />
            ),
          }}
        />

        {/* 3행: 使用可否 + Top メニュー */}
        <DetailRow
          left={{
            label: "使用 可否",
            children: (
              <div className="flex items-center gap-3">
                <Radio
                  name="isActive"
                  value="Y"
                  checked={form.isActive === "Y"}
                  onChange={() => onFormChange("isActive", "Y")}
                  label="Y"
                  disabled={isFormDisabled}
                />
                <Radio
                  name="isActive"
                  value="N"
                  checked={form.isActive === "N"}
                  onChange={() => onFormChange("isActive", "N")}
                  label="N"
                  disabled={isFormDisabled}
                />
              </div>
            ),
          }}
          right={{
            label: "Top メニュー 表示",
            children: (
              <div className="flex items-center gap-3">
                <Radio
                  name="showInTopNav"
                  value="Y"
                  checked={form.showInTopNav === "Y"}
                  onChange={() => onFormChange("showInTopNav", "Y")}
                  label="Y"
                  disabled={isFormDisabled}
                />
                <Radio
                  name="showInTopNav"
                  value="N"
                  checked={form.showInTopNav === "N"}
                  onChange={() => onFormChange("showInTopNav", "N")}
                  label="N"
                  disabled={isFormDisabled}
                />
              </div>
            ),
          }}
        />

        {/* 4행: モバイル */}
        <DetailRow
          left={{
            label: "モバイル",
            children: (
              <div className="flex items-center gap-3">
                <Radio
                  name="showInMobile"
                  value="Y"
                  checked={form.showInMobile === "Y"}
                  onChange={() => onFormChange("showInMobile", "Y")}
                  label="Y"
                  disabled={isFormDisabled}
                />
                <Radio
                  name="showInMobile"
                  value="N"
                  checked={form.showInMobile === "N"}
                  onChange={() => onFormChange("showInMobile", "N")}
                  label="N"
                  disabled={isFormDisabled}
                />
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
