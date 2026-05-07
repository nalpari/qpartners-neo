"use client";

import { useMemo } from "react";

import { Checkbox, Radio } from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";

interface BulkMailFormTargetsProps {
  /** 선택된 권한코드 배열 — qp_roles 동적 (Target Dynamic from Role 후) */
  targetRoleCodes: string[];
  onTargetRoleCodesChange: (codes: string[]) => void;
  disabled: boolean;
}

export function BulkMailFormTargets({
  targetRoleCodes,
  onTargetRoleCodesChange,
  disabled,
}: BulkMailFormTargetsProps) {
  // 발송대상 옵션 — qp_roles.isActive=Y 만 동적 노출 (6 기본 + 추가 권한). 비회원 제외.
  const { memberOptions } = useTargetLabels();
  const targetOptions = useMemo(
    () =>
      memberOptions
        .filter((o): o is typeof o & { roleCode: string } => o.roleCode !== null)
        .map((o) => ({ value: o.roleCode, label: o.label })),
    [memberOptions],
  );

  const handleToggle = (value: string, checked: boolean) => {
    if (checked) {
      onTargetRoleCodesChange([...targetRoleCodes, value]);
    } else {
      onTargetRoleCodesChange(targetRoleCodes.filter((t) => t !== value));
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
            checked={targetRoleCodes.includes(opt.value)}
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
