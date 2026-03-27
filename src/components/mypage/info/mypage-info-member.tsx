"use client";

import { useState } from "react";
import { InputBox, Radio } from "@/components/common";
import { usePopupStore } from "@/lib/store";

interface ViewField {
  label: string;
  value?: string;
  type?: "password-button" | "withdraw-button";
}

const VIEW_FIELDS: ViewField[] = [
  { label: "氏名", value: "金志映" },
  { label: "氏名ひらがな", value: "キムジヨン" },
  { label: "メールアドレス(ID)", value: "kjy0501@interplug.co.kr" },
  { label: "ID(社員コード)", value: "26030200" },
  { label: "パスワード", type: "password-button" },
  { label: "部署名", value: "SI" },
  { label: "役職", value: "Head Manager" },
  { label: "ニュースレター受信", value: "許可 (許可日：2026.03.24)" },
  { label: "会員脱退", type: "withdraw-button" },
];

const BUTTON_LABELS: Record<string, string> = {
  "password-button": "パスワード変更",
  "withdraw-button": "退会する",
};

function ActionButton({
  type,
  fullWidth,
}: {
  type: string;
  fullWidth?: boolean;
}) {
  const { openPopup } = usePopupStore();

  const handleClick = () => {
    if (type === "password-button") {
      openPopup("password-change");
    } else if (type === "withdraw-button") {
      openPopup("withdraw");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`bg-[#f9fcfd] border border-[#c0dff4] text-[#0e78c3] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-center rounded-[4px] px-[16px] ${
        fullWidth ? "w-full h-[42px]" : "h-[38px]"
      }`}
    >
      {BUTTON_LABELS[type]}
    </button>
  );
}

interface MypageInfoMemberProps {
  isEditing?: boolean;
}

export function MypageInfoMember({ isEditing = false }: MypageInfoMemberProps) {
  const [data, setData] = useState({
    lastNameKanji: "金",
    firstNameKanji: "志映",
    lastNameKana: "金",
    firstNameKana: "志映",
    department: "SI",
    position: "Head Manager",
    newsletter: "許可",
  });

  const updateField = (key: string) => (value: string) =>
    
    setData((prev) => ({ ...prev, [key]: value }));

  if (isEditing) {
    return <MemberEditMode data={data} updateField={updateField} />;
  }

  return <MemberViewMode />;
}

/* ─── 조회 모드 ─── */
function MemberViewMode() {
  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px]">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        会員情報
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
              {field.type ? (
                <ActionButton type={field.type} />
              ) : (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                  {field.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col gap-[18px]">
        {VIEW_FIELDS.map((field, idx) => (
          <div
            key={field.label}
            className={`flex flex-col pt-[18px] ${
              field.type ? "gap-[12px]" : "gap-[8px]"
            } ${
              idx === 0
                ? "border-t border-[#101010]"
                : "border-t border-[#eff4f8]"
            }`}
          >
            <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
              {field.label}
            </p>
            {field.type ? (
              <ActionButton type={field.type} fullWidth />
            ) : (
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                {field.value}
              </p>
            )}
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
  type?: "single" | "double" | "radio";
  keys?: [string, string];
  options?: { value: string; label: string }[];
}

const EDIT_FIELDS: EditField[] = [
  {
    label: "氏名",
    key: "name",
    required: true,
    type: "double",
    keys: ["lastNameKanji", "firstNameKanji"],
  },
  {
    label: "氏名ひらがな",
    key: "nameKana",
    required: true,
    type: "double",
    keys: ["lastNameKana", "firstNameKana"],
  },
  { label: "部署名", key: "department", type: "single" },
  { label: "役職", key: "position", type: "single" },
  {
    label: "ニュースレター受信",
    key: "newsletter",
    type: "radio",
    options: [
      { value: "許可", label: "許可" },
      { value: "拒否", label: "拒否" },
    ],
  },
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

interface MemberEditModeProps {
  data: Record<string, string>;
  updateField: (key: string) => (value: string) => void;
}

function MemberEditMode({ data, updateField }: MemberEditModeProps) {
  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px] self-stretch">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        会員情報{" "}
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
              {field.type === "double" && field.keys ? (
                <div className="flex items-center gap-[8px] w-full min-w-0">
                  <InputBox
                    value={data[field.keys[0]]}
                    onChange={updateField(field.keys[0])}
                    className="h-[42px] max-w-[109px] shrink-0"
                  />
                  <InputBox
                    value={data[field.keys[1]]}
                    onChange={updateField(field.keys[1])}
                    className="h-[42px] flex-1 "
                  />
                </div>
              ) : field.type === "radio" && field.options ? (
                <div className="flex items-center gap-3 pl-[16px]">
                  {field.options.map((opt) => (
                    <Radio
                      key={opt.value}
                      name={field.key}
                      value={opt.value}
                      checked={data[field.key] === opt.value}
                      onChange={() => updateField(field.key)(opt.value)}
                      label={opt.label}
                    />
                  ))}
                </div>
              ) : (
                <InputBox
                  value={data[field.key]}
                  onChange={updateField(field.key)}
                  className="h-[42px] w-full"
                />
              )}
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
            {field.type === "double" && field.keys ? (
              <div className="flex flex-col gap-[8px] w-full">
                <InputBox
                  value={data[field.keys[0]]}
                  onChange={updateField(field.keys[0])}
                  className="h-[42px]"
                />
                <InputBox
                  value={data[field.keys[1]]}
                  onChange={updateField(field.keys[1])}
                  className="h-[42px]"
                />
              </div>
            ) : field.type === "radio" && field.options ? (
              <div className="flex items-center gap-3">
                {field.options.map((opt) => (
                  <Radio
                    key={opt.value}
                    name={`${field.key}-mo`}
                    value={opt.value}
                    checked={data[field.key] === opt.value}
                    onChange={() => updateField(field.key)(opt.value)}
                    label={opt.label}
                  />
                ))}
              </div>
            ) : (
              <InputBox
                value={data[field.key]}
                onChange={updateField(field.key)}
                className="h-[42px]"
              />
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
