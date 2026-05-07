"use client";

// Design Ref: §3.3 — 검색 UI + onSearch/onReset 콜백 (Target Dynamic from Role 후)

import { useState, useMemo } from "react";
import { InputBox, SelectBox, Radio, Button, DatePicker } from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";
import type { MassMailSearchParams } from "./bulk-mail-types";

interface BulkMailSearchProps {
  onSearch: (params: MassMailSearchParams) => void;
  onReset: () => void;
}

export function BulkMailSearch({ onSearch, onReset }: BulkMailSearchProps) {
  // 配信対象 옵션 — qp_roles.isActive=Y 만 동적 노출 (6 기본 + 추가 권한). 비회원 제외.
  const { memberOptions } = useTargetLabels();
  const targetOptions = useMemo(
    () => [
      { value: "", label: "全体" },
      ...memberOptions
        .filter((o): o is typeof o & { roleCode: string } => o.roleCode !== null)
        .map((o) => ({ value: o.roleCode, label: o.label })),
    ],
    [memberOptions],
  );

  const [title, setTitle] = useState("");
  const [authorSearchType, setAuthorSearchType] = useState<"name" | "id">("name");
  const [authorQuery, setAuthorQuery] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const handleSearch = () => {
    onSearch({
      keyword: title.trim() || undefined,
      roleCode: roleCode || undefined,
      authorSearchType: authorQuery.trim() ? authorSearchType : undefined,
      authorQuery: authorQuery.trim() || undefined,
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  const handleReset = () => {
    setTitle("");
    setAuthorSearchType("name");
    setAuthorQuery("");
    setRoleCode("");
    setStartDate(null);
    setEndDate(null);
    onReset();
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[24px] px-[24px] w-[1440px]">
      <div className="flex flex-col gap-1">
        {/* 1행: タイトル / 登録者 */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                タイトル
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <InputBox value={title} onChange={setTitle} onKeyDown={handleKeyDown} placeholder="" className="w-full" />
            </div>
          </div>

          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                登録者
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <div className="flex flex-wrap items-center gap-2 w-full">
                <Radio
                  name="authorSearchType"
                  value="name"
                  checked={authorSearchType === "name"}
                  onChange={() => setAuthorSearchType("name")}
                  label="Name"
                />
                <Radio
                  name="authorSearchType"
                  value="id"
                  checked={authorSearchType === "id"}
                  onChange={() => setAuthorSearchType("id")}
                  label="ID"
                />
                <InputBox
                  value={authorQuery}
                  onChange={setAuthorQuery}
                  onKeyDown={handleKeyDown}
                  placeholder=""
                  className="flex-1 min-w-[120px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2행: 配信対象 / 配信日 */}
        <div className="flex gap-1 items-start">
          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                配信対象
              </span>
            </div>
            <div className="flex flex-1 items-center bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <SelectBox options={targetOptions} value={roleCode} onChange={setRoleCode} className="w-full" />
            </div>
          </div>

          <div className="flex flex-1 gap-1 h-[58px] items-center">
            <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
              <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
                配信日
              </span>
            </div>
            <div className="flex flex-1 items-center gap-1 bg-white border border-[#EAF0F6] rounded-[6px] p-2">
              <DatePicker value={startDate} onChange={setStartDate} className="flex-1" />
              <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010] shrink-0">~</span>
              <DatePicker value={endDate} onChange={setEndDate} className="flex-1" />
            </div>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex items-center justify-end gap-[6px] mt-[18px]">
        <Button variant="primary" onClick={handleSearch}>検索</Button>
        <Button variant="secondary" onClick={handleReset}>初期化</Button>
      </div>
    </div>
  );
}
