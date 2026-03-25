"use client";

import { useState } from "react";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, SelectBox, Radio } from "@/components/common";
import type { MemberDetailItem } from "@/components/admin/members/members-dummy-data";

const CLOSE_ANIMATION_MS = 200;

const PERMISSION_OPTIONS_GENERAL = [
  { value: "1次販売店", label: "1次販売店" },
  { value: "2次以降販売店", label: "2次以降販売店" },
  { value: "施工店", label: "施工店" },
  { value: "一般", label: "一般" },
];

/** 읽기전용 텍스트 값 */
function TextValue({ value }: { value: string }) {
  return (
    <p className="flex-1 font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#101010] overflow-hidden text-ellipsis whitespace-nowrap">
      {value || "—"}
    </p>
  );
}

/** 라벨 셀 */
function LabelCell({ label }: { label: string }) {
  return (
    <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </span>
    </div>
  );
}

/** 값 셀 — 텍스트/컨트롤 직접 배치 (Figma 기준: 셀 안에 텍스트 직접) */
function ValueCell({ children, hasBorder = true }: { children: React.ReactNode; hasBorder?: boolean }) {
  return (
    <div className={`flex flex-1 items-center h-full rounded-[6px] pl-4 pr-2 py-2 ${
      hasBorder ? "bg-white border border-[#EAF0F6]" : ""
    }`}>
      {children}
    </div>
  );
}

/** 값 셀 — 내부에 InputBox/SelectBox 등 폼 요소 배치 */
function FormCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center h-full bg-white border border-[#EAF0F6] rounded-[6px] p-2">
      {children}
    </div>
  );
}

/** 2열 행 */
function DetailRow({
  left,
  right,
}: {
  left: { label: string; children: React.ReactNode; isForm?: boolean; noBorder?: boolean };
  right?: { label: string; children: React.ReactNode; isForm?: boolean; noBorder?: boolean };
}) {
  const renderValue = (item: { children: React.ReactNode; isForm?: boolean; noBorder?: boolean }) => {
    if (item.isForm) return <FormCell>{item.children}</FormCell>;
    return <ValueCell hasBorder={!item.noBorder}>{item.children}</ValueCell>;
  };

  return (
    <div className="flex gap-1 items-start">
      <div className="flex flex-1 gap-1 h-[58px] items-center">
        <LabelCell label={left.label} />
        {renderValue(left)}
      </div>
      {right && (
        <div className="flex flex-1 gap-1 h-[58px] items-center">
          <LabelCell label={right.label} />
          {renderValue(right)}
        </div>
      )}
    </div>
  );
}

export function MemberDetailPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const [isClosing, setIsClosing] = useState(false);

  const member = popupData.member as MemberDetailItem | undefined;

  // 편집 가능 필드 state
  const [userPermission, setUserPermission] = useState(member?.userPermission ?? "");
  const [twoFactorAuth, setTwoFactorAuth] = useState(member?.twoFactorAuth ?? "有効");
  const [loginNotify, setLoginNotify] = useState(member?.loginNotify ?? "有効");
  const [memberStatus, setMemberStatus] = useState(member?.memberStatus ?? "Active");
  const [attributeNotify, setAttributeNotify] = useState(member?.attributeNotify ?? "有効");

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = () => {
    openAlert({
      type: "alert",
      message: "保存しました。",
      confirmLabel: "確認",
    });
  };

  const handlePasswordReset = () => {
    openAlert({
      type: "confirm",
      message: "パスワードを初期化しますか？",
      confirmLabel: "初期化",
      cancelLabel: "キャンセル",
    });
  };

  if (!member) return null;

  const isGeneral = member.memberType === "一般";

  return (
    <div className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}>
      <div
        className="popup-container !w-[900px] !max-w-[900px]"
        role="dialog"
        aria-modal="true"
        aria-label="会員情報"
      >
        <div className="popup-container__inner !gap-[18px]">
        {/* 타이틀 */}
        
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            会員情報
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#E97923] cursor-pointer"
            aria-label="閉じる"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 등록일 / 갱신일 뱃지 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center px-2 py-[2px] bg-white border border-[#eee] rounded-[4px] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
              登録日
            </span>
            <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#999]">
              {member.createdAt}
            </span>
          </div>
          <span className="text-[#ccc]">|</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center px-2 py-[2px] bg-white border border-[#eee] rounded-[4px] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
              更新日
            </span>
            <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#999]">
              {member.updatedAt}
            </span>
            <span className="font-['Noto_Sans_JP'] font-normal text-[13px] text-[#bbb]">
              ({member.updatedBy})
            </span>
          </div>
        </div>

        {/* 상단 테이블 — 회원 정보 */}
        <div className="flex flex-col gap-1">
          {/* 1행: ID / 비밀번호 초기화 */}
          <DetailRow
            left={{ label: "ID", children: <TextValue value={member.id} /> }}
            right={{
              label: "PW初期化",
              isForm: true,
              children: (
                <Button variant="outline" onClick={handlePasswordReset} className="w-full">
                  パスワード初期化
                </Button>
              ),
            }}
          />
          {/* 2행: 氏名 / 会員タイプ */}
          <DetailRow
            left={{ label: "氏名", children: <TextValue value={member.name} /> }}
            right={{ label: "会員タイプ", children: <TextValue value={member.memberType} /> }}
          />
          {/* 3행: 氏名ひらがな / ユーザー権限 */}
          <DetailRow
            left={{ label: "氏名ひらがな", children: <TextValue value={member.nameKana} /> }}
            right={{
              label: "ユーザー権限",
              isForm: isGeneral,
              children: isGeneral ? (
                <SelectBox
                  options={PERMISSION_OPTIONS_GENERAL}
                  value={userPermission}
                  onChange={setUserPermission}
                  className="w-full"
                />
              ) : (
                <TextValue value={member.userPermission} />
              ),
            }}
          />
          {/* 4행: Email / 部署名 */}
          <DetailRow
            left={{ label: "Email", children: <TextValue value={member.email} /> }}
            right={{ label: "部署名", children: <TextValue value={member.department} /> }}
          />
          {/* 5행: 最近アクセス日時 / 役職 */}
          <DetailRow
            left={{ label: "最近アクセス", children: <TextValue value={member.lastAccessAt} /> }}
            right={{ label: "役職", children: <TextValue value={member.position} /> }}
          />
          {/* 6행: 二次認証 / ログイン通知 */}
          <DetailRow
            left={{
              label: "二次認証",

              children: (
                <div className="flex items-center gap-3">
                  <Radio name="twoFactor" value="有効" checked={twoFactorAuth === "有効"} onChange={() => setTwoFactorAuth("有効")} label="有効" />
                  <Radio name="twoFactor" value="無効" checked={twoFactorAuth === "無効"} onChange={() => setTwoFactorAuth("無効")} label="無効" />
                </div>
              ),
            }}
            right={{
              label: "ログイン通知",

              children: (
                <div className="flex items-center gap-3">
                  <Radio name="loginNotify" value="有効" checked={loginNotify === "有効"} onChange={() => setLoginNotify("有効")} label="有効" />
                  <Radio name="loginNotify" value="無効" checked={loginNotify === "無効"} onChange={() => setLoginNotify("無効")} label="無効" />
                </div>
              ),
            }}
          />
          {/* 7행: 会員状態 / 属性変更通知 */}
          <DetailRow
            left={{
              label: "会員状態",

              children: (
                <div className="flex items-center gap-3">
                  <Radio name="memberStatus" value="Active" checked={memberStatus === "Active"} onChange={() => setMemberStatus("Active")} label="Active" />
                  <Radio name="memberStatus" value="Delete" checked={memberStatus === "Delete"} onChange={() => setMemberStatus("Delete")} label="Delete" />
                </div>
              ),
            }}
            right={{
              label: "属性変更通知",

              children: (
                <div className="flex items-center gap-3">
                  <Radio name="attrNotify" value="有効" checked={attributeNotify === "有効"} onChange={() => setAttributeNotify("有効")} label="有効" />
                  <Radio name="attrNotify" value="無効" checked={attributeNotify === "無効"} onChange={() => setAttributeNotify("無効")} label="無効" />
                </div>
              ),
            }}
          />
          {/* 8행: 退会日時 (전체 너비) */}
          <DetailRow
            left={{ label: "退会日時", children: <TextValue value={member.withdrawnAt} /> }}
          />
          {/* 9행: 退会理由 (전체 너비) */}
          <DetailRow
            left={{ label: "退会理由", children: <TextValue value={member.withdrawReason} /> }}
          />
        </div>

        {/* 하단 테이블 — 회사 정보 (gap 18px) */}
        <div className="flex flex-col gap-1 mt-[18px]">
          {/* 1행: 会社名 / 法人番号 */}
          <DetailRow
            left={{ label: "会社名", children: <TextValue value={member.companyName} /> }}
            right={{ label: "法人番号", children: <TextValue value={member.corporateNumber} /> }}
          />
          {/* 2행: 会社名ひらがな / 電話番号 */}
          <DetailRow
            left={{ label: "会社名ひらがな", children: <TextValue value={member.companyNameKana} /> }}
            right={{ label: "電話番号", children: <TextValue value={member.phone} /> }}
          />
          {/* 3행: 郵便番号 / FAX番号 */}
          <DetailRow
            left={{ label: "郵便番号", children: <TextValue value={member.zipcode} /> }}
            right={{ label: "FAX番号", children: <TextValue value={member.fax} /> }}
          />
          {/* 4행: 住所 (전체 너비) */}
          <DetailRow
            left={{ label: "住所", children: <TextValue value={member.address} /> }}
          />
        </div>

        {/* 하단 버튼 */}
        <div className="popup-buttons--inline">
          <Button variant="secondary" onClick={handleClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}
