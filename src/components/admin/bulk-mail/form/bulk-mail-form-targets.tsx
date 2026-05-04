"use client";

import { useMemo } from "react";

import { Checkbox, Radio } from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";

/** QpRole 관리 대상 아닌 고정 옵션 — 항상 노출 */
const FIXED_TARGET_OPTIONS = [
  { value: "super-admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
];

/** useTargetLabels targetType → 대량메일 UI value 매핑 */
const TARGET_TYPE_TO_UI_VALUE: Record<string, string> = {
  first_store: "first-dealer",
  second_store: "second-dealer",
  seko: "installer",
  general: "general",
};

interface BulkMailFormTargetsProps {
  targets: string[];
  onTargetsChange: (targets: string[]) => void;
  disabled: boolean;
}

export function BulkMailFormTargets({
  targets,
  onTargetsChange,
  disabled,
}: BulkMailFormTargetsProps) {
  // 발송대상 옵션 — QpRole.isActive=Y 만 동적 노출 + 고정 옵션(super-admin/admin)
  const { getAllOptions } = useTargetLabels();
  const targetOptions = useMemo(() => [
    ...FIXED_TARGET_OPTIONS,
    ...getAllOptions()
      .filter((o) => o.isActive && TARGET_TYPE_TO_UI_VALUE[o.value])
      .map((o) => ({ value: TARGET_TYPE_TO_UI_VALUE[o.value], label: o.label })),
  ], [getAllOptions]);

  const handleToggle = (value: string, checked: boolean) => {
    if (checked) {
      onTargetsChange([...targets, value]);
    } else {
      onTargetsChange(targets.filter((t) => t !== value));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#101010]">
        配信対象
        <span className="text-[#FF1A1A]">*</span>
      </h3>
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
        {targetOptions.map((opt) => (
          <Checkbox
            key={opt.value}
            checked={targets.includes(opt.value)}
            onChange={(checked) => handleToggle(opt.value, checked)}
            label={opt.label}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

interface BulkMailFormNewsletterProps {
  optOut: boolean;
  onOptOutChange: (optOut: boolean) => void;
  disabled: boolean;
}

export function BulkMailFormNewsletter({
  optOut,
  onOptOutChange,
  disabled,
}: BulkMailFormNewsletterProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#101010]">
        ニュースレター配信対象
        <span className="text-[#FF1A1A]">*</span>
      </h3>
      <div className="flex items-center gap-x-[18px]">
        <Radio
          name="optOut"
          checked={!optOut}
          onChange={() => onOptOutChange(false)}
          label="ニュースレター受信拒否会員を除外して配信"
          disabled={disabled}
        />
        <Radio
          name="optOut"
          checked={optOut}
          onChange={() => onOptOutChange(true)}
          label="ニュースレター受信拒否会員を含めて配信"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
