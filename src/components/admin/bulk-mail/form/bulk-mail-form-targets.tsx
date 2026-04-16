"use client";

import { Checkbox, Radio } from "@/components/common";

const TARGET_OPTIONS = [
  { value: "super-admin", label: "スーパー管理者" },
  { value: "admin", label: "管理者" },
  { value: "first-dealer", label: "1次販売店" },
  { value: "second-dealer", label: "2次以降販売店" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般会員" },
];

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
        {TARGET_OPTIONS.map((opt) => (
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
