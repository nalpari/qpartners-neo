"use client";

import { Checkbox } from "@/components/common";

const TARGET_OPTIONS = [
  { value: "market-admin", label: "全マーケット管理者" },
  { value: "admin", label: "管理者" },
  { value: "first-dealer", label: "1次販売店" },
  { value: "second-dealer", label: "2次以降販売店" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般" },
  { value: "delivery-notify", label: "配信完了通知受信者" },
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
