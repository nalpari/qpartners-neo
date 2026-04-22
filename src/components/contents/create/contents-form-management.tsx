"use client";

import { useMemo } from "react";
import { SelectBox } from "@/components/common";
import { useApprover } from "@/hooks/use-approver";

interface ContentsFormManagementProps {
  distributor: string;
  publishDate: string;
  updater: string;
  updateDate: string;
  department: string;
  approver: string;
  onApproverChange: (value: string) => void;
}

export function ContentsFormManagement({
  distributor,
  publishDate,
  updater,
  updateDate,
  department,
  approver,
  onApproverChange,
}: ContentsFormManagementProps) {
  const { options: approverOptions, isLoading: isLoadingApprover } = useApprover();
  // SelectBox placeholder 노출용 선두 옵션 "選択" prepend
  const selectOptions = useMemo(
    () => [{ value: "", label: "選択" }, ...approverOptions],
    [approverOptions],
  );

  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        管理情報
      </h2>

      <div className="flex flex-col gap-1">
        {/* 1행: 配信担当者 / 担当部門 / 更新担当者 */}
        <div className="flex gap-1">
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                配信担当者
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {distributor}
              </span>
            </div>
          </div>
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                担当部門
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-6 pr-2">
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {department}
              </span>
            </div>
          </div>
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                更新担当者
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {updater}
              </span>
            </div>
          </div>
        </div>

        {/* 2행: 掲載日 / 最終承認者 / 更新日 */}
        <div className="flex gap-1">
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                掲載日
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {publishDate}
              </span>
            </div>
          </div>
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                最終承認者
                <span className="text-[#FF1A1A]">*</span>
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <SelectBox
                options={selectOptions}
                value={approver}
                onChange={onApproverChange}
                placeholder="選択"
                disabled={isLoadingApprover}
              />
            </div>
          </div>
          <div className="flex flex-1 gap-1 h-[58px]">
            <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                更新日
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {updateDate}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
