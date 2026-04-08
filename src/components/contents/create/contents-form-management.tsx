"use client";

import { SelectBox } from "@/components/common";

// 최종승인자 옵션 (추후 공통코드)
const APPROVER_OPTIONS = [
  { value: "", label: "選択" },
  { value: "1", label: "実務担当者" },
  { value: "2", label: "所属長" },
  { value: "3", label: "事業部長" },
  { value: "4", label: "社長" },
];

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
  return (
    <section className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-4 pt-[34px] pb-6 px-6 w-[1440px]">
      <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        管理情報
      </h2>

      <div className="flex flex-col gap-1">
        {/* 1행: 배신담당자 / 게재일 / 갱신담당자 */}
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

        {/* 2행: 갱신일 / 담당부문 / 최종승인자 */}
        <div className="flex gap-1">
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
                最終承認者
                <span className="text-[#FF1A1A]">*</span>
              </span>
            </div>
            <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <SelectBox
                options={APPROVER_OPTIONS}
                value={approver}
                onChange={onApproverChange}
                placeholder="選択"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
