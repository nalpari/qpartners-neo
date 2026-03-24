"use client";

import { useState } from "react";
import { InputBox } from "@/components/common";
import { usePopupStore } from "@/lib/store";

const VIEW_FIELDS = [
  { label: "会員タイプ", value: "一般会員" },
  { label: "会社名", value: "INTERPLUG TEST" },
  { label: "会社名ひらがな", value: "インタープラグ  テスト" },
  { label: "住所", value: "(108-0014) 東京都港区芝4-10-1 ハンファビル9F" },
  { label: "電話番号", value: "03-5441-5943" },
  { label: "FAX番号", value: "088-685-3054" },
  { label: "法人番号", value: "-" },
];

interface MypageInfoCorporateProps {
  isEditing?: boolean;
}

export function MypageInfoCorporate({
  isEditing = false,
}: MypageInfoCorporateProps) {
  const [data, setData] = useState({
    memberType: "一般会員",
    companyName: "INTERPLUG TEST",
    companyNameKana: "インタープラグ  テスト",
    zipCode: "1080014",
    address: "東京都港区芝4-10-1",
    addressDetail: "ハンファビル9F",
    phone: "088-685-3054",
    fax: "088-685-3054",
    corporateNumber: "0000000",
  });

  const updateField = (key: string) => (value: string) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const { openPopup } = usePopupStore();

  const handleZipcodeSearch = () => {
    openPopup("zipcode-search", {
      onSelect: (addr: { zipcode: string; prefecture: string; city: string; town: string }) => {
        setData((prev) => ({
          ...prev,
          zipCode: addr.zipcode,
          address: `${addr.prefecture}${addr.city}${addr.town}`,
        }));
      },
    });
  };

  if (isEditing) {
    return (
      <CorporateEditMode
        data={data}
        updateField={updateField}
        onZipcodeSearch={handleZipcodeSearch}
      />
    );
  }

  return <CorporateViewMode />;
}

/* ─── 조회 모드 ─── */
function CorporateViewMode() {
  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px]">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        法人情報
      </h3>

      {/* PC */}
      <div className="hidden lg:flex flex-col gap-[4px]">
        {VIEW_FIELDS.map((field) => (
          <div
            key={field.label}
            className="flex gap-[4px] h-[58px] items-center w-full"
          >
            <div className="bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] w-[160px] h-full flex items-center pl-[16px] pr-[8px] shrink-0">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
                {field.label}
              </p>
            </div>
            <div className="bg-white border border-[#eaf0f6] rounded-[6px] flex-1 h-full flex items-center pl-[24px] pr-[8px]">
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {field.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col gap-[18px]">
        {VIEW_FIELDS.map((field, idx) => (
          <div
            key={field.label}
            className={`flex flex-col gap-[8px] pt-[18px] ${
              idx === 0
                ? "border-t border-[#101010]"
                : "border-t border-[#eff4f8]"
            }`}
          >
            <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
              {field.label}
            </p>
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
              {field.value}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ─── 수정 모드 ─── */

interface EditField {
  label: string;
  key: string;
  required?: boolean;
  type?: "readonly" | "input" | "zip" | "address";
}

const EDIT_FIELDS: EditField[] = [
  { label: "会員タイプ", key: "memberType", type: "readonly" },
  { label: "会社名", key: "companyName", required: true, type: "input" },
  { label: "会社名ひらがな", key: "companyNameKana", type: "input" },
  { label: "郵便番号", key: "zipCode", required: true, type: "zip" },
  { label: "住所", key: "address", required: true, type: "address" },
  { label: "電話番号", key: "phone", required: true, type: "input" },
  { label: "FAX番号", key: "fax", type: "input" },
  { label: "法人番号", key: "corporateNumber", type: "input" },
];

function ThLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
      {label}
      {required && <span className="text-[#ff1a1a]">*</span>}
    </p>
  );
}

interface CorporateEditModeProps {
  data: Record<string, string>;
  updateField: (key: string) => (value: string) => void;
  onZipcodeSearch: () => void;
}

function CorporateEditMode({ data, updateField, onZipcodeSearch }: CorporateEditModeProps) {
  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px]">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        法人情報{" "}
        <span className="text-[#ff1a1a]">(*必須)</span>
      </h3>

      {/* PC */}
      <div className="hidden lg:flex flex-col gap-[4px]">
        {EDIT_FIELDS.map((field) => (
          <div
            key={field.label}
            className="flex gap-[4px] h-[58px] items-center w-full"
          >
            <div className="bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] w-[160px] h-full flex items-center pl-[16px] pr-[8px] shrink-0">
              <ThLabel label={field.label} required={field.required} />
            </div>
            <div className="bg-white border border-[#eaf0f6] rounded-[6px] flex-1 h-full flex items-center p-[8px]">
              <EditFieldContent
                field={field}
                data={data}
                updateField={updateField}
                onZipcodeSearch={onZipcodeSearch}
                layout="pc"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col gap-[18px]">
        {EDIT_FIELDS.map((field, idx) => (
          <div
            key={field.label}
            className={`flex flex-col gap-[8px] pt-[18px] ${
              idx === 0
                ? "border-t border-[#101010]"
                : "border-t border-[#eff4f8]"
            }`}
          >
            <ThLabel label={field.label} required={field.required} />
            <EditFieldContent
              field={field}
              data={data}
              updateField={updateField}
              onZipcodeSearch={onZipcodeSearch}
              layout="mobile"
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function EditFieldContent({
  field,
  data,
  updateField,
  onZipcodeSearch,
  layout,
}: {
  field: EditField;
  data: Record<string, string>;
  updateField: (key: string) => (value: string) => void;
  onZipcodeSearch: () => void;
  layout: "pc" | "mobile";
}) {
  switch (field.type) {
    case "readonly":
      return (
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate pl-[16px] lg:pl-[16px]">
          {data[field.key]}
        </p>
      );

    case "zip":
      return layout === "pc" ? (
        <div className="flex items-center gap-[8px] w-full">
          <InputBox
            value={data.zipCode}
            disabled
            className="h-[42px] flex-1"
          />
          <button
            type="button"
            onClick={onZipcodeSearch}
            className="bg-[#ecf4f9] border border-[#c0dff4] text-[#0e78c3] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-center h-[42px] w-[84px] rounded-[4px] shrink-0"
          >
            住所検索
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[8px] w-full">
          <InputBox
            value={data.zipCode}
            disabled
            className="h-[42px]"
          />
          <button
            type="button"
            onClick={onZipcodeSearch}
            className="w-full bg-[#ecf4f9] border border-[#c0dff4] text-[#0e78c3] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-center h-[42px] rounded-[4px]"
          >
            住所検索
          </button>
        </div>
      );

    case "address":
      return layout === "pc" ? (
        <div className="flex items-center gap-[8px] w-full min-w-0">
          <InputBox
            value={data.address}
            onChange={updateField("address")}
            className="h-[42px] flex-1"
          />
          <InputBox
            value={data.addressDetail}
            onChange={updateField("addressDetail")}
            className="h-[42px] flex-1"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-[8px] w-full">
          <InputBox
            value={data.address}
            onChange={updateField("address")}
            className="h-[42px]"
          />
          <InputBox
            value={data.addressDetail}
            onChange={updateField("addressDetail")}
            className="h-[42px]"
          />
        </div>
      );

    default:
      return (
        <InputBox
          value={data[field.key]}
          onChange={updateField(field.key)}
          className="h-[42px] w-full"
        />
      );
  }
}
