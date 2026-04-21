"use client";

// Design Ref: §4.2 — 검색 필터 (2행 6필드 레이아웃)

import { useState } from "react";
import { InputBox, SelectBox, Button } from "@/components/common";
import { STATUS_OPTIONS, MEMBER_TYPE_OPTIONS } from "./members-types";
import type { MemberSearchFilters } from "./members-types";

interface MembersSearchProps {
  onSearch: (filters: MemberSearchFilters) => void;
  onReset: () => void;
}

interface LocalFields {
  id: string;
  name: string;
  email: string;
  status: string;
  userType: string;
  companyName: string;
}

const INITIAL_LOCAL: LocalFields = {
  id: "",
  name: "",
  email: "",
  status: "",
  userType: "",
  companyName: "",
};

export function MembersSearch({ onSearch, onReset }: MembersSearchProps) {
  const [local, setLocal] = useState<LocalFields>(INITIAL_LOCAL);

  const updateLocal = (key: keyof LocalFields) => (value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setLocal(INITIAL_LOCAL);
    onReset();
  };

  const handleSearch = () => {
    // API keyword 단일 파라미터: 입력된 텍스트 필드 중 첫 번째 비어있지 않은 값 사용
    const keyword = [local.id, local.name, local.email, local.companyName]
      .map((v) => v.trim())
      .find(Boolean) ?? "";

    onSearch({
      keyword,
      status: local.status,
      userType: local.userType,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]">
      <div className="flex flex-col gap-1">
        {/* 1행: ID / 氏名 / Email */}
        <div className="flex gap-1 items-start">
          <SearchField label="ID">
            <InputBox value={local.id} onChange={updateLocal("id")} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
          </SearchField>
          <SearchField label="氏名" width="w-[461px]">
            <InputBox value={local.name} onChange={updateLocal("name")} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
          </SearchField>
          <SearchField label="Email" width="w-[461px]">
            <InputBox value={local.email} onChange={updateLocal("email")} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
          </SearchField>
        </div>

        {/* 2행: 状態 / 会員タイプ / 会社名 */}
        <div className="flex gap-1 items-start">
          <SearchField label="状態">
            <SelectBox
              options={[...STATUS_OPTIONS]}
              value={local.status}
              onChange={updateLocal("status")}
              className="w-full"
            />
          </SearchField>
          <SearchField label="会員タイプ" width="w-[461px]">
            <SelectBox
              options={[...MEMBER_TYPE_OPTIONS]}
              value={local.userType}
              onChange={updateLocal("userType")}
              className="w-full"
            />
          </SearchField>
          <SearchField label="会社名" width="w-[461px]">
            <InputBox value={local.companyName} onChange={updateLocal("companyName")} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
          </SearchField>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary" onClick={handleSearch}>
          検索
        </Button>
        <Button variant="secondary" onClick={handleReset}>
          初期化
        </Button>
      </div>
    </div>
  );
}

function SearchField({
  label,
  width,
  children,
}: {
  label: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex ${width ?? "flex-1"} gap-1 h-[58px] items-center`}>
      <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
        <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
      </div>
      <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
        {children}
      </div>
    </div>
  );
}
