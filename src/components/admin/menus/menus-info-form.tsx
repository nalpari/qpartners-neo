"use client";

import { Button, InputBox, SelectBox, Radio } from "@/components/common";
import type { MenuFormState } from "./menus-dummy-data";

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
  onFormChange: (field: keyof MenuFormState, value: string) => void;
  onNew: () => void;
  onSave: () => void;
}

export function MenusInfoForm({
  form,
  level1Options,
  isEditing,
  onFormChange,
  onNew,
  onSave,
}: MenusInfoFormProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="font-['Noto_Sans_JP'] font-semibold text-[15px] text-[#101010]">
          メニュー情報
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onNew}>
            新規
          </Button>
          <Button variant="primary" onClick={onSave}>
            保存
          </Button>
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
                placeholder="コード入力"
              />
            ),
          }}
        />

        {/* 2행: Menu Name + Page URL */}
        <DetailRow
          left={{
            label: "Menu Name",
            children: (
              <InputBox
                value={form.menuName}
                onChange={(v) => onFormChange("menuName", v)}
                placeholder="メニュー名入力"
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
                />
                <Radio
                  name="isActive"
                  value="N"
                  checked={form.isActive === "N"}
                  onChange={() => onFormChange("isActive", "N")}
                  label="N"
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
                />
                <Radio
                  name="showInTopNav"
                  value="N"
                  checked={form.showInTopNav === "N"}
                  onChange={() => onFormChange("showInTopNav", "N")}
                  label="N"
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
                />
                <Radio
                  name="showInMobile"
                  value="N"
                  checked={form.showInMobile === "N"}
                  onChange={() => onFormChange("showInMobile", "N")}
                  label="N"
                />
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
