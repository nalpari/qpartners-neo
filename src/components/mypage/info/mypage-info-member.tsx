"use client";

import { InputBox, Radio } from "@/components/common";
import { usePopupStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import type { ProfileData, EditFormData } from "./mypage-info";

// Design Ref: §4.3 — 회원정보 필드 타입
interface ViewField {
  label: string;
  value?: string;
  type?: "password-button" | "withdraw-button";
}

function formatNewsletter(yn: "Y" | "N", date: string | null): string {
  if (yn === "Y") {
    return date ? `許可 (許可日：${formatDate(date)})` : "許可";
  }
  return date ? `拒否 (拒否日：${formatDate(date)})` : "拒否";
}

function buildMemberFields(profile: ProfileData, userId: string, userType: string): ViewField[] {
  // 원본 userName(QSP userNm) 우선, split 된 sei+mei 는 fallback.
  // QSP 가 userNm 에 공백 없는 단일 문자열로 내려주면 splitName 실패 → sei/mei null →
  // 기존에는 "-" 노출되던 현상. 원본 필드 우선 사용으로 해결.
  const fullName = profile.userName?.trim()
    || [profile.sei, profile.mei].filter(Boolean).join(" ")
    || "-";
  const fullNameKana = profile.userNameKana?.trim()
    || [profile.seiKana, profile.meiKana].filter(Boolean).join(" ")
    || "-";

  const fields: ViewField[] = [
    { label: "氏名", value: fullName },
    { label: "氏名ひらがな", value: fullNameKana },
  ];

  const emailLabel = userType === "GENERAL" ? "メールアドレス (ID)" : "メールアドレス";
  fields.push({ label: emailLabel, value: profile.email || "-" });

  if (userType === "ADMIN" || userType === "STORE") {
    fields.push({ label: "ID(社員コード)", value: userId || "-" });
  }

  fields.push({ label: "パスワード", type: "password-button" });

  if (userType === "ADMIN" || userType === "GENERAL") {
    fields.push({ label: "部署名", value: profile.department || "-" });
  }

  if (userType !== "SEKO") {
    fields.push({ label: "役職", value: profile.jobTitle || "-" });
  }

  fields.push({ label: "ニュースレター受信", value: formatNewsletter(profile.newsRcptYn, profile.newsRcptDate) });

  if (userType === "GENERAL") {
    fields.push({ label: "会員脱退", type: "withdraw-button" });
  }

  return fields;
}

const BUTTON_LABELS: Record<string, string> = {
  "password-button": "パスワード変更",
  "withdraw-button": "退会する",
};

function ActionButton({ type, fullWidth }: { type: string; fullWidth?: boolean }) {
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
  profile: ProfileData;
  userId: string;
  userType: string;
  isEditing?: boolean;
  editData: EditFormData | null;
  updateField: (key: keyof EditFormData) => (value: string) => void;
}

export function MypageInfoMember({ profile, userId, userType, isEditing = false, editData, updateField }: MypageInfoMemberProps) {
  if (isEditing && editData) {
    return <MemberEditMode data={editData} userType={userType} updateField={updateField} />;
  }

  const viewFields = buildMemberFields(profile, userId, userType);

  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px]">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        会員情報
      </h3>

      {/* PC */}
      <div className="hidden lg:flex flex-col gap-[4px]">
        {viewFields.map((field) => (
          <div key={field.label} className="flex gap-[4px] h-[58px] items-center w-full">
            <div className="bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] w-[160px] h-full flex items-center pl-[16px] pr-[8px] shrink-0">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">{field.label}</p>
            </div>
            <div className="bg-white border border-[#eaf0f6] rounded-[6px] flex-1 h-full flex items-center pl-[24px] pr-[8px]">
              {field.type ? (
                <ActionButton type={field.type} />
              ) : (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">{field.value}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col gap-[18px]">
        {viewFields.map((field, idx) => (
          <div
            key={field.label}
            className={`flex flex-col pt-[18px] ${field.type ? "gap-[12px]" : "gap-[8px]"} ${
              idx === 0 ? "border-t border-[#101010]" : "border-t border-[#eff4f8]"
            }`}
          >
            <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">{field.label}</p>
            {field.type ? (
              <ActionButton type={field.type} fullWidth />
            ) : (
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">{field.value}</p>
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
  key: keyof EditFormData;
  required?: boolean;
  type?: "single" | "double" | "radio";
  keys?: [keyof EditFormData, keyof EditFormData];
  options?: { value: string; label: string }[];
}

// Design Ref: §6.2 — userType별 수정 가능 필드
function getEditFields(userType: string): EditField[] {
  const fields: EditField[] = [];

  // GENERAL만 성명 수정 가능 (SEKO는 뉴스레터만 수정 가능)
  if (userType === "GENERAL") {
    fields.push(
      { label: "氏名", key: "sei", required: true, type: "double", keys: ["sei", "mei"] },
      { label: "氏名ひらがな", key: "seiKana", required: true, type: "double", keys: ["seiKana", "meiKana"] },
    );
  }

  // GENERAL만 부서/직책 수정 가능
  if (userType === "GENERAL") {
    fields.push(
      { label: "部署名", key: "department", type: "single" },
      { label: "役職", key: "jobTitle", type: "single" },
    );
  }

  // 전 회원 뉴스레터 수정 가능
  fields.push({
    label: "ニュースレター受信",
    key: "newsRcptYn",
    type: "radio",
    options: [
      { value: "Y", label: "許可" },
      { value: "N", label: "拒否" },
    ],
  });

  return fields;
}

function ThLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
      {label}
      {required && <span className="text-[#ff1a1a]">*</span>}
    </p>
  );
}

interface MemberEditModeProps {
  data: EditFormData;
  userType: string;
  updateField: (key: keyof EditFormData) => (value: string) => void;
}

function MemberEditMode({ data, userType, updateField }: MemberEditModeProps) {
  const editFields = getEditFields(userType);

  return (
    <article className="flex-1 bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[24px] py-[34px] lg:pt-[34px] lg:pb-[42px] lg:px-[42px] self-stretch">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] mb-[14px]">
        会員情報 <span className="text-[#ff1a1a]">(*必須)</span>
      </h3>

      {/* PC */}
      <div className="hidden lg:flex flex-col gap-[4px]">
        {editFields.map((field) => (
          <div key={field.label} className="flex gap-[4px] h-[58px] items-center w-full">
            <div className="bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] w-[160px] h-full flex items-center pl-[16px] pr-[8px] shrink-0">
              <ThLabel label={field.label} required={field.required} />
            </div>
            <div className="bg-white border border-[#eaf0f6] rounded-[6px] flex-1 h-full flex items-center p-[8px]">
              {field.type === "double" && field.keys ? (
                <div className="flex items-center gap-[8px] w-full min-w-0">
                  <InputBox value={data[field.keys[0]]} onChange={updateField(field.keys[0])} className="h-[42px] max-w-[109px] shrink-0" />
                  <InputBox value={data[field.keys[1]]} onChange={updateField(field.keys[1])} className="h-[42px] flex-1" />
                </div>
              ) : field.type === "radio" && field.options ? (
                <div className="flex items-center gap-3 pl-[16px]">
                  {field.options.map((opt) => (
                    <Radio key={opt.value} name={field.key} value={opt.value} checked={data[field.key] === opt.value} onChange={() => updateField(field.key)(opt.value)} label={opt.label} />
                  ))}
                </div>
              ) : (
                <InputBox value={data[field.key]} onChange={updateField(field.key)} className="h-[42px] w-full" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 모바일 */}
      <div className="flex lg:hidden flex-col gap-[18px]">
        {editFields.map((field, idx) => (
          <div key={field.label} className={`flex flex-col gap-[8px] pt-[18px] ${idx === 0 ? "border-t border-[#101010]" : "border-t border-[#eff4f8]"}`}>
            <ThLabel label={field.label} required={field.required} />
            {field.type === "double" && field.keys ? (
              <div className="flex flex-col gap-[8px] w-full">
                <InputBox value={data[field.keys[0]]} onChange={updateField(field.keys[0])} className="h-[42px]" />
                <InputBox value={data[field.keys[1]]} onChange={updateField(field.keys[1])} className="h-[42px]" />
              </div>
            ) : field.type === "radio" && field.options ? (
              <div className="flex items-center gap-3">
                {field.options.map((opt) => (
                  <Radio key={opt.value} name={`${field.key}-mo`} value={opt.value} checked={data[field.key] === opt.value} onChange={() => updateField(field.key)(opt.value)} label={opt.label} />
                ))}
              </div>
            ) : (
              <InputBox value={data[field.key]} onChange={updateField(field.key)} className="h-[42px]" />
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
