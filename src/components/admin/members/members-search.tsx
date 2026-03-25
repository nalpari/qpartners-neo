"use client";

import { useState } from "react";
import { InputBox, SelectBox, Button } from "@/components/common";

const STATUS_OPTIONS = [
  { value: "", label: "全体" },
  { value: "active", label: "アクティブ" },
  { value: "inactive", label: "非アクティブ" },
];

const MEMBER_TYPE_OPTIONS = [
  { value: "", label: "全体" },
  { value: "btob", label: "BtoB" },
  { value: "btoc", label: "BtoC" },
];

export function MembersSearch() {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [memberType, setMemberType] = useState("");
  const [companyName, setCompanyName] = useState("");

  const handleReset = () => {
    setId("");
    setName("");
    setEmail("");
    setStatus("");
    setMemberType("");
    setCompanyName("");
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]">
      <div className="flex flex-col gap-1">
        {/* 1행: ID / 氏名 / Email */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                ID
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={id} onChange={setId} placeholder="" className="w-full" />
            </div>
          </div>

          <div className="flex w-[461px] gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                氏名
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={name} onChange={setName} placeholder="" className="w-full" />
            </div>
          </div>

          <div className="flex w-[461px] gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                Email
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={email} onChange={setEmail} placeholder="" className="w-full" />
            </div>
          </div>
        </div>

        {/* 2행: 状態 / 会員タイプ / 会社名 */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                状態
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <SelectBox options={STATUS_OPTIONS} value={status} onChange={setStatus} className="w-full" />
            </div>
          </div>

          <div className="flex w-[461px] gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                会員タイプ
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <SelectBox options={MEMBER_TYPE_OPTIONS} value={memberType} onChange={setMemberType} className="w-full" />
            </div>
          </div>

          <div className="flex w-[461px] gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
                会社名
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={companyName} onChange={setCompanyName} placeholder="" className="w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary">
          検索
        </Button>
        <Button variant="secondary" onClick={handleReset}>
          初期化
        </Button>
      </div>
    </div>
  );
}
