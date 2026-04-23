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
  formatDate,
} from "@/components/admin/members/members-types";

const CLOSE_ANIMATION_MS = 200;

/**
 * mutationFn 실행 시점에 팝업 컨텍스트(userId/userTp) 가 이미 유실된 경우 던지는 센티널 에러.
 * onError 에서 `instanceof` 로 판별해 handleApiError 의 일반화 "サーバーエラー" 덮어쓰기를 방지.
 * 문자열 prefix 매칭보다 견고 — AxiosError 등 다른 에러와 명확히 구분된다.
 */
class MemberDetailContextLost extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberDetailContextLost";
  }
}

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
    mutationFn: async (payload: MemberUpdatePayload) => {
      // handleSave 에서 이미 userId/userTp 가드 후 호출된다 (도달 불가 경로 안전망).
      // 혹여 도달 시 "undefined" 문자열이 URL 에 주입되어 엉뚱한 회원이 대상이 되는 버그를
      // 막는다 (encodeURIComponent(undefined) → "undefined").
      if (!userId || !userTp) {
        console.error("[MemberDetailPopup] mutationFn 도달 시점에 userId/userTp 미확정 — race 가능성");
        // 유저 메시지는 handleSave 에서 이미 노출됐을 가능성이 높지만, 직접 mutate 경로도
        // 차단되도록 alert 로 안내 후 중단. onError(handleApiError) 의 "サーバーエラー"
        // 일반화 메시지로 본질이 뭉개지지 않도록 명시적 알림.
        openAlert({
          type: "alert",
          message: "会員情報が読み込まれていません。再度開き直してください。",
          onConfirm: () => closePopup(),
        });
        throw new MemberDetailContextLost("userId/userTp missing");
      }
      const res = await api.put<{
        data: {
          message: string;
          member?: MemberDetail;
          warning?: string;
        };
      }>(
        `/admin/members/${encodeURIComponent(userId)}`,
        payload,
        { params: { userTp } },
      );
      return res.data.data;
    },
    onSuccess: async (result) => {
      // 목록은 상태 뱃지/정렬 반영 위해 invalidate 유지
      await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
      if (result.member) {
        // 서버가 member 스냅샷을 준 경우 캐시 직접 갱신 —
        // Delete 전환 시 QSP F_NOT_USER 재조회로 필드가 비어버리는 문제 방지.
        queryClient.setQueryData(
          ["admin", "member", userId, userTp],
          result.member,
        );
      } else {
        // snapshot 미반환(preDetail null 복구 경로 / userRolePostCheckFailed 로 서버가
        // 의도적으로 snapshot drop 한 경로 포함) — invalidateQueries 로 강제 재조회한다.
        // 서버의 "사후 검증 불가 → 강제 재조회" 의도와 프론트 캐시 정책을 일치시켜,
        // stale userRole 이 캐시에 남아 운영자가 "반영 안 됨" 으로 오인하는 상황을 방지.
        // F_NOT_USER 응답은 백엔드가 notFoundInQsp=true 로 내려주고, 프론트는 listItem
        // fallback 으로 기본 필드를 채우므로 공백 화면이 재발하지 않는다.
        await queryClient.invalidateQueries({ queryKey: ["admin", "member", userId, userTp] });
      }
      // TOCTOU 사후 검증 실패/불일치 경고만 노출 (userRole 변경 경로에서만 발생).
      // 경고 발생 시 운영자가 목록에서 재확인하도록 안내 문구 부가.
      const warningMsg = result.warning;
      const message = warningMsg
        ? `保存しました。\n\n注意:\n${warningMsg}\n\n一覧から再度ご確認ください。`
        : "保存しました。";
      openAlert({
        type: "alert",
        message,
        // TOCTOU 감지·기본값 주입 등 warning 경로에서는 팝업을 자동으로 닫지 않는다.
        // 운영자가 확인 직후 회원 상세 화면에서 현재 상태를 다시 검토할 수 있도록
        // 컨텍스트를 유지한다 (닫기는 유저가 명시적으로 수행). 경고가 없는 정상 저장
        // 경로에서만 기존 UX 대로 자동 닫기.
        onConfirm: warningMsg ? undefined : () => closePopup(),
      });
    },
    onError: (err: unknown) => {
      // mutationFn 자체 가드(컨텍스트 유실) 경로는 이미 전용 alert 를 띄웠으므로
      // handleApiError 의 일반화 메시지로 덮지 않는다. 전용 에러 클래스로 판별해
      // 문자열 계약 취약성을 제거한다.
      if (err instanceof MemberDetailContextLost) {
        return;
      }
      handleApiError(err, "会員情報の更新");
    },
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
  const isQspNotFound = rawMember?.notFoundInQsp === true;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSave = (payload: MemberUpdatePayload) => {
    // 요청 직전 컨텍스트 유실(팝업 닫힘 중 저장·스토어 초기화 등) 방어.
    // mutate 전 early-return 으로 "サーバーエラー" 뭉개짐을 피하고, 운영자에게
    // 본질적 원인을 명확히 안내한다.
    if (!userId || !userTp) {
      console.error("[MemberDetailPopup] 업데이트 전 userId/userTp 미확정 — 요청 중단", {
        hasUserId: !!userId,
        hasUserTp: !!userTp,
      });
      openAlert({
        type: "alert",
        message: "会員情報が読み込まれていません。再度開き直してください。",
        onConfirm: () => closePopup(),
      });
      return;
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
            <MemberEditForm
              key={member.userId}
              member={member}
              isQspNotFound={isQspNotFound}
              isSaving={isSaving}
              onSave={handleSave}
              onPasswordReset={handlePasswordReset}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** 편집 state를 가진 내부 컴포넌트 — key prop으로 리마운트하여 state 초기화 */
function MemberEditForm({
  member,
  isQspNotFound,
  isSaving,
  onSave,
  onPasswordReset,
  onClose,
}: {
  member: MemberDetail;
  isQspNotFound: boolean;
  isSaving: boolean;
  onSave: (payload: MemberUpdatePayload) => void;
  onPasswordReset: () => void;
  onClose: () => void;
}) {
  const memberTp = USER_TYPE_REVERSE_MAP[member.userType] ?? "";
  const isGeneral = memberTp === "GENERAL";
  const isStatusEditable = isGeneral || memberTp === "SEKO";
  const isWithdrawn = member.status === "withdrawn";
  // notFoundInQsp + listItem 없는(status unknown) 회원도 읽기전용
  const isReadOnly = isWithdrawn || (isQspNotFound && member.status === "unknown");

  // SEKO 는 신규 부여 불가(2026-04-23 정책) 이지만 기존 SEKO 권한 회원이 있을 수 있으므로
  // 표시값은 그대로 보존. SEKO 상태에서는 SelectBox 대신 TextValue 로 읽기전용 표시.
  const editableRoleValues = ROLE_OPTIONS_GENERAL.map((o) => o.value as string);
  const safeRole = (role: string | undefined) => {
    if (!role) return "GENERAL";
    if (editableRoleValues.includes(role)) return role;
    // "SEKO" 등 옵션에 없는 기존 권한은 보존 — handleSave 에서 편집 안 됐을 때 전송 제외 처리.
    return role;
  };
  const [userRole, setUserRole] = useState(safeRole(member.userRole));
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(member.twoFactorEnabled ?? true);
  const [loginNotification, setLoginNotification] = useState(member.loginNotification);
  const [memberStatus, setMemberStatus] = useState(API_TO_STATUS[member.status] ?? "Active");
  const [attributeNotify, setAttributeNotify] = useState(member.attributeChangeNotification);
  const [newsRcptYn, setNewsRcptYn] = useState(member.newsRcptYn);

  // 삭제/탈퇴 회원(isQspNotFound) 복구 경로 — status=Active 로 전환.
  // 백엔드는 이 경로에서 userRole + twoFactorEnabled 명시 필수(복구 후 QSP 잔존 값 silent 부활 방어).
  const isRestoringToActive = isQspNotFound && isStatusEditable && memberStatus === "Active";

  // 기존 SEKO 권한은 편집 UI 제공 안함 (옵션에 SEKO 없어 SelectBox 값 공백 방지).
  // 단, 복구 경로(isRestoringToActive)는 관리자가 SEKO → 다른 권한 재부여가 필수이므로 lock 해제.
  // 복구 경로 + SEKO: SelectBox 에서 SEKO 옵션 부재로 빈 표시 → 관리자가 명시적 재선택 후 저장(미선택 저장 시 BE 400).
  const isUserRoleLocked = !editableRoleValues.includes(userRole) && !isRestoringToActive;

  const handleSave = () => {
    const payload: MemberUpdatePayload = {
      loginNotification,
      attributeChangeNotification: attributeNotify,
      newsRcptYn,
    };
    // 일반 경로(preDetail 존재) 또는 복구 경로에서만 2FA 전송.
    // 비복구 + preDetail null(삭제 상태 유지) 경로에서는 백엔드가 변경 차단(400).
    if (!isQspNotFound || isRestoringToActive) {
      payload.twoFactorEnabled = twoFactorEnabled;
    }
    if (isStatusEditable) {
      payload.status = memberStatus === "Active" ? "active" : "deleted";
    }
    // userRole 은 GENERAL 회원에게만 적용. 복구 경로에서도 userTp=GENERAL 한정으로 전송.
    // 기존 SEKO 권한은 새 옵션에서 제외되어 편집 불가 → 전송 제외(BE Zod 거부 방지 + 기존 값 보존).
    if (isGeneral && (!isQspNotFound || isRestoringToActive) && !isUserRoleLocked) {
      payload.userRole = userRole;
    }
    onSave(payload);
  };

  return (
            <>
              {/* 등록일 / 갱신일 뱃지 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center px-2 py-[2px] bg-white border border-[#eee] rounded-[4px] font-pretendard font-medium text-[13px] leading-[1.5] text-[#999]">
                    登録日
                  </span>
                  <span className="font-['Noto_Sans_JP'] font-normal text-[14px] text-[#999]">
                    {member.createdAt ? formatDate(member.createdAt) : "-"}
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
                      <Button variant="outline" onClick={onPasswordReset} disabled={isSaving || isReadOnly} className="w-full">
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
                    // GENERAL 일반 수정 경로 + 복구 경로(isRestoringToActive) 에서 편집 가능.
                    // 단, 기존 SEKO 권한(isUserRoleLocked) 은 신규 옵션에서 제외되어 읽기전용.
                    isForm: isGeneral && !isReadOnly && (!isQspNotFound || isRestoringToActive) && !isUserRoleLocked,
                    children: isGeneral && !isReadOnly && (!isQspNotFound || isRestoringToActive) && !isUserRoleLocked ? (
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
                {/* 最近アクセス: 1순위 lastLoginAt(로그인 시각), 2순위 updatedAt(레코드 갱신 시각).
                    현재 백엔드 GET /api/admin/members/:id 응답에 lastLoginAt 매핑 미반영 상태 →
                    사실상 updatedAt 로 fallback. 백엔드 매핑 추가되면 자동으로 로그인 시각 표시. */}
                <DetailRow
                  left={{
                    label: "最近アクセス",
                    children: (
                      <TextValue
                        value={
                          member.lastLoginAt
                            ? formatDateTime(member.lastLoginAt)
                            : member.updatedAt
                              ? formatDateTime(member.updatedAt)
                              : "-"
                        }
                      />
                    ),
                  }}
                  right={{ label: "役職", children: <TextValue value={member.jobTitle} /> }}
                />
                {/* 6행: 二次認証 / ログイン通知 */}
                <DetailRow
                  left={{
                    label: "二次認証",
                    children: (
                      <div className="flex items-center gap-3">
                        <Radio name="twoFactor" value="true" checked={twoFactorEnabled === true} onChange={() => setTwoFactorEnabled(true)} label="有効" disabled={isReadOnly || (isQspNotFound && !isRestoringToActive)} />
                        <Radio name="twoFactor" value="false" checked={twoFactorEnabled === false} onChange={() => setTwoFactorEnabled(false)} label="無効" disabled={isReadOnly || (isQspNotFound && !isRestoringToActive)} />
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
                <Button variant="secondary" onClick={onClose}>
                  {isReadOnly ? "閉じる" : "キャンセル"}
                </Button>
                {!isReadOnly && (
                  <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "保存中..." : "保存"}
                  </Button>
                )}
              </div>
            </>
  );
}
