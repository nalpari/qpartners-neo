"use client";

// Design Ref: §4.2 — 회원 상세 팝업 (useQuery + useMutation 2개)

import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button, SelectBox, Radio, Spinner } from "@/components/common";
import type { MemberDetail, MemberUpdatePayload, MemberListItem } from "@/components/admin/members/members-types";
import {
  USER_TYPE_REVERSE_MAP,
  ROLE_OPTIONS_GENERAL,
  ROLE_LABEL_MAP,
  API_TO_STATUS,
  formatDateTime,
} from "@/components/admin/members/members-types";

const CLOSE_ANIMATION_MS = 200;

function TextValue({ value }: { value: string }) {
  return (
    <p className="flex-1 font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#101010] break-all">
      {value || "-"}
    </p>
  );
}

function LabelCell({ label }: { label: string }) {
  return (
    <div className="w-[120px] shrink-0 flex items-center h-full bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-2">
      <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </span>
    </div>
  );
}

function ValueCell({ children, hasBorder = true }: { children: React.ReactNode; hasBorder?: boolean }) {
  return (
    <div className={`flex flex-1 items-center h-full min-w-0 rounded-[6px] pl-4 pr-2 py-2 ${
      hasBorder ? "bg-white border border-[#EAF0F6]" : ""
    }`}>
      {children}
    </div>
  );
}

function FormCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center h-full min-w-0 bg-white border border-[#EAF0F6] rounded-[6px] p-2">
      {children}
    </div>
  );
}

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
    <div className="flex gap-1 items-stretch min-h-[58px]">
      <div className={`flex gap-1 items-stretch min-w-0 ${right ? "w-1/2" : "w-full"}`}>
        <LabelCell label={left.label} />
        {renderValue(left)}
      </div>
      {right && (
        <div className="flex w-1/2 gap-1 items-stretch min-w-0">
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
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);

  const userId = typeof popupData.userId === "string" ? popupData.userId : undefined;
  const userTp = typeof popupData.userTp === "string" ? popupData.userTp : undefined;
  const listItem = popupData.listItem as MemberListItem | undefined;

  // Design Ref: §4.2 — 상세 조회
  const { data: rawMember, isLoading } = useQuery<MemberDetail & { notFoundInQsp?: boolean }>({
    queryKey: ["admin", "member", userId, userTp],
    queryFn: async () => {
      const res = await api.get<{ data: MemberDetail & { notFoundInQsp?: boolean } }>(
        `/admin/members/${encodeURIComponent(userId!)}`,
        { params: { userTp } },
      );
      return res.data.data;
    },
    enabled: !!userId && !!userTp,
  });

  // QSP 미조회 회원(notFoundInQsp)일 때 목록 데이터로 fallback
  const member: MemberDetail | undefined = rawMember
    ? rawMember.notFoundInQsp && listItem
      ? {
          ...rawMember,
          userId: listItem.userId,
          userName: listItem.userName,
          userNameKana: listItem.userNameKana,
          email: listItem.email,
          userType: listItem.userType,
          companyName: listItem.companyName,
          status: listItem.status,
          lastLoginAt: listItem.lastLoginAt,
          createdAt: listItem.createdAt,
        }
      : rawMember
    : undefined;

  // 편집 가능 필드 state (member 로드 후 초기화)
  const memberTp = member ? (USER_TYPE_REVERSE_MAP[member.userType] ?? "") : "";
  const isGeneral = memberTp === "GENERAL";
  // 판매점(STORE)·관리자(ADMIN)는 회원상태 수정 불가
  const isStatusEditable = isGeneral || memberTp === "SEKO";
  // GENERAL 회원의 권한 — 유효한 옵션에 없으면 "GENERAL" 디폴트
  const validRoleValues = ROLE_OPTIONS_GENERAL.map((o) => o.value as string);
  const safeRole = (role: string | undefined) =>
    role && validRoleValues.includes(role) ? role : "GENERAL";
  const [userRole, setUserRole] = useState(safeRole(member?.userRole));
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(member?.twoFactorEnabled ?? true);
  const [loginNotification, setLoginNotification] = useState(member?.loginNotification ?? true);
  const [memberStatus, setMemberStatus] = useState(API_TO_STATUS[member?.status ?? "active"] ?? "Active");
  const [attributeNotify, setAttributeNotify] = useState(member?.attributeChangeNotification ?? true);
  const [newsRcptYn, setNewsRcptYn] = useState(member?.newsRcptYn ?? "Y");

  // member 로드 후 state 동기화 (첫 로드 시 한 번만)
  const [initialized, setInitialized] = useState(false);
  if (member && !initialized) {
    setUserRole(safeRole(member.userRole));
    setTwoFactorEnabled(member.twoFactorEnabled ?? true);
    setLoginNotification(member.loginNotification);
    setMemberStatus(API_TO_STATUS[member.status] ?? "Active");
    setAttributeNotify(member.attributeChangeNotification);
    setNewsRcptYn(member.newsRcptYn);
    setInitialized(true);
  }

  // Design Ref: §6 — API 에러 처리
  function handleApiError(err: unknown, context: string) {
    if (!isAxiosError(err) || !err.response) {
      openAlert({ type: "alert", message: "サーバーエラーが発生しました。" });
      return;
    }
    const { status, data } = err.response;
    const msg = typeof data === "object" && data !== null && "error" in data && typeof (data as Record<string, unknown>).error === "string"
      ? (data as Record<string, unknown>).error as string
      : "";

    if (status === 400 && msg.includes("自分自身")) {
      openAlert({ type: "alert", message: "自分自身のアカウントは変更できません。" });
    } else if (status === 400 && msg.includes("一般会員のみ")) {
      openAlert({ type: "alert", message: "ユーザー権限の変更は一般会員のみ可能です。" });
    } else if (status === 400 && msg.includes("アクティブ")) {
      openAlert({ type: "alert", message: "アクティブな会員のみパスワード初期化が可能です。" });
    } else if (status === 429) {
      openAlert({ type: "alert", message: "リクエストが多すぎます。しばらくしてからお試しください。" });
    } else {
      openAlert({ type: "alert", message: `${context}に失敗しました。` });
    }
  }

  // Design Ref: §4.2 — 수정 mutation
  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) =>
      api.put(`/admin/members/${encodeURIComponent(userId!)}`, payload, {
        params: { userTp },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "member", userId, userTp] });
      openAlert({
        type: "alert",
        message: "保存しました。",
        onConfirm: () => closePopup(),
      });
    },
    onError: (err: unknown) => handleApiError(err, "会員情報の更新"),
  });

  // Design Ref: §4.2 — 비밀번호 초기화 mutation
  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/members/${encodeURIComponent(userId!)}/reset-password`, null, {
        params: { userTp },
      }),
    onSuccess: () => {
      openAlert({ type: "alert", message: "パスワード変更リンクをメールで送信しました。" });
    },
    onError: (err: unknown) => handleApiError(err, "パスワード初期化"),
  });

  const isSaving = updateMutation.isPending || resetPasswordMutation.isPending;
  // 탈퇴(withdrawn) 상태는 조회만 가능, 수정 불가
  const isWithdrawn = member?.status === "withdrawn";
  const isReadOnly = isWithdrawn;
  // QSP 미조회 회원은 twoFactor/userRole 편집 불가 (백엔드 critical 변경 차단)
  const isQspNotFound = rawMember?.notFoundInQsp === true;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = () => {
    if (!member) return;

    const payload: MemberUpdatePayload = {
      loginNotification,
      attributeChangeNotification: attributeNotify,
      newsRcptYn,
    };

    // QSP 미조회(탈퇴/삭제) 회원은 twoFactorEnabled/userRole 제외 (백엔드 critical 변경 차단)
    if (!isQspNotFound) {
      payload.twoFactorEnabled = twoFactorEnabled;
    }

    // 판매점(STORE)·관리자(ADMIN)는 상태 수정 불가
    if (isStatusEditable) {
      payload.status = memberStatus === "Active" ? "active" : "deleted";
    }

    // GENERAL만 userRole 포함 (QSP 미조회 시 제외)
    if (isGeneral && !isQspNotFound) {
      payload.userRole = userRole;
    }

    updateMutation.mutate(payload);
  };

  const handlePasswordReset = () => {
    openAlert({
      type: "confirm",
      message: "パスワードを初期化しますか？\n初期化されたパスワードはメールで送信されます。",
      onConfirm: () => resetPasswordMutation.mutate(),
    });
  };

  if (!userId) return null;

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

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={48} />
            </div>
          ) : !member ? (
            <div className="flex items-center justify-center py-20">
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#ff1a1a]">
                会員情報を読み込めませんでした。
              </p>
            </div>
          ) : (
            <>
              {/* 등록일 / 갱신일 뱃지 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center px-2 py-[2px] bg-white border border-[#eee] rounded-[4px] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
                    登録日
                  </span>
                  <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#999]">
                    {member.createdAt ? formatDateTime(member.createdAt) : "-"}
                  </span>
                </div>
                <span className="text-[#ccc]">|</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center px-2 py-[2px] bg-white border border-[#eee] rounded-[4px] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
                    更新日
                  </span>
                  <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#999]">
                    {member.updatedAt ? formatDateTime(member.updatedAt) : "-"}
                  </span>
                  {member.updatedBy && (
                    <span className="font-['Noto_Sans_JP'] font-normal text-[13px] text-[#bbb]">
                      ({member.updatedBy})
                    </span>
                  )}
                </div>
              </div>

              {/* 상단 테이블 — 회원 정보 */}
              <div className="flex flex-col gap-1">
                {/* 1행: ID / PW初期化 */}
                <DetailRow
                  left={{ label: "ID", children: <TextValue value={member.userId} /> }}
                  right={{
                    label: "PW初期化",
                    isForm: true,
                    children: (
                      <Button variant="outline" onClick={handlePasswordReset} disabled={isSaving || isReadOnly} className="w-full">
                        パスワード初期化
                      </Button>
                    ),
                  }}
                />
                {/* 2행: 氏名 / 会員タイプ */}
                <DetailRow
                  left={{ label: "氏名", children: <TextValue value={member.userName} /> }}
                  right={{ label: "会員タイプ", children: <TextValue value={member.userType} /> }}
                />
                {/* 3행: 氏名ひらがな / ユーザー権限 */}
                <DetailRow
                  left={{ label: "氏名ひらがな", children: <TextValue value={member.userNameKana} /> }}
                  right={{
                    label: "ユーザー権限",
                    isForm: isGeneral && !isReadOnly && !isQspNotFound,
                    children: isGeneral && !isReadOnly && !isQspNotFound ? (
                      <SelectBox
                        options={[...ROLE_OPTIONS_GENERAL]}
                        value={userRole}
                        onChange={setUserRole}
                        className="w-full"
                      />
                    ) : (
                      <TextValue value={ROLE_LABEL_MAP[member.userRole] ?? member.userRole} />
                    ),
                  }}
                />
                {/* 4행: Email / 部署名 */}
                <DetailRow
                  left={{ label: "Email", children: <TextValue value={member.email} /> }}
                  right={{ label: "部署名", children: <TextValue value={member.department} /> }}
                />
                {/* 5행: 最近アクセス / 役職 */}
                <DetailRow
                  left={{ label: "最近アクセス", children: <TextValue value={member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "-"} /> }}
                  right={{ label: "役職", children: <TextValue value={member.jobTitle} /> }}
                />
                {/* 6행: 二次認証 / ログイン通知 */}
                <DetailRow
                  left={{
                    label: "二次認証",
                    children: (
                      <div className="flex items-center gap-3">
                        <Radio name="twoFactor" value="true" checked={twoFactorEnabled === true} onChange={() => setTwoFactorEnabled(true)} label="有効" disabled={isReadOnly || isQspNotFound} />
                        <Radio name="twoFactor" value="false" checked={twoFactorEnabled === false} onChange={() => setTwoFactorEnabled(false)} label="無効" disabled={isReadOnly || isQspNotFound} />
                      </div>
                    ),
                  }}
                  right={{
                    label: "ログイン通知",
                    children: (
                      <div className="flex items-center gap-3">
                        <Radio name="loginNotify" value="true" checked={loginNotification} onChange={() => setLoginNotification(true)} label="有効" disabled={isReadOnly} />
                        <Radio name="loginNotify" value="false" checked={!loginNotification} onChange={() => setLoginNotification(false)} label="無効" disabled={isReadOnly} />
                      </div>
                    ),
                  }}
                />
                {/* 7행: 会員状態 / 属性変更通知 */}
                <DetailRow
                  left={{
                    label: "会員状態",
                    children: isStatusEditable && !isReadOnly ? (
                      <div className="flex items-center gap-3">
                        <Radio name="memberStatus" value="Active" checked={memberStatus === "Active"} onChange={() => setMemberStatus("Active")} label="Active" />
                        <Radio name="memberStatus" value="Delete" checked={memberStatus === "Delete"} onChange={() => setMemberStatus("Delete")} label="Delete" />
                      </div>
                    ) : (
                      <TextValue value={memberStatus} />
                    ),
                  }}
                  right={{
                    label: "属性変更通知",
                    children: (
                      <div className="flex items-center gap-3">
                        <Radio name="attrNotify" value="true" checked={attributeNotify} onChange={() => setAttributeNotify(true)} label="有効" disabled={isReadOnly} />
                        <Radio name="attrNotify" value="false" checked={!attributeNotify} onChange={() => setAttributeNotify(false)} label="無効" disabled={isReadOnly} />
                      </div>
                    ),
                  }}
                />
                {/* 8행: 退会日時 / ニュースレター */}
                <DetailRow
                  left={{ label: "退会日時", children: <TextValue value={isStatusEditable && member.withdrawnAt ? formatDateTime(member.withdrawnAt) : "-"} /> }}
                  right={{
                    label: "ニュースレター",
                    children: (
                      <div className="flex items-center gap-3">
                        <Radio name="newsletter" value="Y" checked={newsRcptYn === "Y"} onChange={() => setNewsRcptYn("Y")} label="許可" disabled={isReadOnly} />
                        <Radio name="newsletter" value="N" checked={newsRcptYn === "N"} onChange={() => setNewsRcptYn("N")} label="拒否" disabled={isReadOnly} />
                        {member.newsRcptDate && (
                          <span className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#999] whitespace-nowrap">
                            (許可日：{formatDateTime(member.newsRcptDate)})
                          </span>
                        )}
                      </div>
                    ),
                  }}
                />
                {/* 9행: 退会理由 */}
                <DetailRow
                  left={{ label: "退会理由", children: <TextValue value={member.withdrawReason ?? "-"} /> }}
                />
              </div>

              {/* 하단 테이블 — 회사 정보 */}
              <div className="flex flex-col gap-1 mt-[18px]">
                <DetailRow
                  left={{ label: "会社名", children: <TextValue value={member.companyName} /> }}
                  right={{ label: "法人番号", children: <TextValue value="-" /> }}
                />
                <DetailRow
                  left={{ label: "会社名ひらがな", children: <TextValue value={member.companyNameKana} /> }}
                  right={{ label: "電話番号", children: <TextValue value={member.telNo} /> }}
                />
                <DetailRow
                  left={{ label: "郵便番号", children: <TextValue value={member.zipcode} /> }}
                  right={{ label: "FAX番号", children: <TextValue value={member.faxNo} /> }}
                />
                <DetailRow
                  left={{ label: "住所", children: <TextValue value={[member.address, member.address2].filter(Boolean).join(" ")} /> }}
                />
              </div>

              {/* 하단 버튼 */}
              <div className="popup-buttons--inline">
                <Button variant="secondary" onClick={handleClose}>
                  {isReadOnly ? "閉じる" : "キャンセル"}
                </Button>
                {!isReadOnly && (
                  <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "保存中..." : "保存"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
