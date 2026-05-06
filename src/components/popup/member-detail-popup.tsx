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
  ROLE_LABEL_MAP,
  API_TO_STATUS,
  formatDateTime,
  formatDate,
} from "@/components/admin/members/members-types";
import type { RoleApiItem, RolesResponse } from "@/components/admin/permissions/permissions-types";
import { rolesQueryKey } from "@/components/admin/permissions/permissions-types";
import { useUserType } from "@/hooks/use-user-type";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { ADMIN_MENU } from "@/lib/menu-codes";

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
  // staleTime: 0 + refetchOnMount: "always" — 팝업 재오픈 시 항상 최신 데이터.
  // 갱신일(updatedAt) / 최근접속일시(lastLoginAt) 등 외부에서 변경 가능한 필드를 반영.
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
    staleTime: 0,
    refetchOnMount: "always",
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
    // 권한 부여 불가(SUPER_ADMIN/ADMIN) — 백엔드 메시지 그대로 노출해 운영자 원인 파악 가능 (Redmine #2178).
    } else if (status === 400 && msg.includes("付与できません")) {
      openAlert({ type: "alert", message: "この権限はユーザーに付与できません。" });
    // 미존재/비활성 권한 — 권한관리 화면에서 사용여부 확인 필요.
    } else if (status === 400 && msg.includes("存在しないか無効")) {
      openAlert({ type: "alert", message: "指定された権限は存在しないか無効です。" });
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
    onSuccess: async (result, payload) => {
      // 목록은 상태 뱃지/정렬 반영 위해 invalidate 유지
      await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
      if (result.member) {
        // 서버가 member 스냅샷을 준 경우 즉시 캐시 갱신 (UI 깜빡임 없는 즉시 반영).
        // 단, 스냅샷의 updatedAt 등 일부 필드가 백엔드 PUT 응답 시점에 stale 일 가능성이 있어
        // 아래 invalidate 로 GET 재조회까지 보장한다.
        queryClient.setQueryData(
          ["admin", "member", userId, userTp],
          result.member,
        );
      }
      // 항상 invalidate 로 GET 강제 재조회 — 백엔드 PUT 응답의 updatedAt 등 stale 필드 방어.
      // F_NOT_USER 응답은 백엔드가 notFoundInQsp=true 로 내려주고, 프론트는 listItem
      // fallback 으로 기본 필드를 채우므로 Delete 전환 시 공백 화면 재발 없음.
      await queryClient.invalidateQueries({ queryKey: ["admin", "member", userId, userTp] });
      // userRole 변경 시 본인의 메뉴 매트릭스도 즉시 갱신 (Redmine #2183).
      // 본인이 자기 권한을 변경하는 경우 5분 staleTime 동안 admin 화면 버튼 가시성이 stale 되는 회귀 방지.
      // 의도적 over-invalidate — 다른 회원의 userRole 변경 시 invalidate 호출은 본인 매트릭스에
      // 영향이 없어 무해(GET /me/permissions 응답 동일). PUT 응답에서 대상 회원이 본인인지 식별
      // 하려면 추가 분기가 필요하므로, 단순화 + 본인 변경 케이스 안전성을 우선해 일괄 invalidate.
      if (payload.userRole !== undefined) {
        await queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      }
      // TOCTOU 사후 검증 실패/불일치 경고만 노출 (userRole 변경 경로에서만 발생).
      // 경고 발생 시 운영자가 목록에서 재확인하도록 안내 문구 부가.
      const warningMsg = result.warning;
      const message = warningMsg
        ? `保存しました。\n\n注意:\n${warningMsg}\n\n一覧から再度ご確認ください。`
        : "保存しました。";
      // 저장 성공 alert 확인 후에도 팝업을 자동 닫지 않는다 (2026-04-29 정책 갱신).
      // 운영자가 동일 회원의 다른 항목을 연속 편집할 수 있도록 컨텍스트를 유지하고,
      // 닫기는 유저가 キャンセル / × 버튼으로 명시적으로 수행하도록 한다.
      openAlert({
        type: "alert",
        message,
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
  // 빈 SelectBox("選択") 상태 저장 시도를 클라이언트에서 차단하기 위해 alert 직접 호출.
  // 부모(MemberDetailPopup) 의 동일 store 인스턴스를 공유 — 별도 props drilling 불필요.
  const { openAlert } = useAlertStore();
  // RBAC 표준 패턴 C — ADM_MEMBER.canUpdate 가 false 면 편집 UI 자체 비표시 (readonly 강제).
  // 로딩 중 fail-closed (isPermLoading 시 readonly) — 권한 응답 도착 전 클릭 race window 차단.
  // 서버 PUT /api/admin/members/[id] 도 requireMenuPermission(ADM_MEMBER, update) 로 최종 검증.
  const { canUpdate: canUpdateMember, isLoading: isPermLoading } = useMenuPermission(ADMIN_MENU.MEMBERS);
  const isPermReadOnly = isPermLoading || !canUpdateMember;
  // USER_TYPE 공통코드 reverseMap 만 사용 — 하드코딩 fallback 제거됨.
  // 매핑 불가 시 memberTp="" → isGeneral=false → 편집 UI 비표시 (read-only).
  const { reverseMap: dynamicReverseMap } = useUserType();
  const memberTp = dynamicReverseMap[member.userType] ?? "";
  const isGeneral = memberTp === "GENERAL";
  // 관리자 회원관리는 SEKO 를 대상에서 제외(목록 필터에서도 미노출).
  // 설사 상세 팝업에 SEKO 가 도달하더라도 BE 화이트리스트상 status 는 GENERAL 전용이므로
  // 편집 UI 자체를 표시하지 않는다 — 과거 `isGeneral || SEKO` 로직의 BE/FE 불일치 제거.
  const isStatusEditable = isGeneral && !isPermReadOnly;
  const isWithdrawn = member.status === "withdrawn";
  // notFoundInQsp + listItem 없는(status unknown) 회원도 읽기전용 — RBAC 권한 매트릭스도 함께 OR.
  const isReadOnly = isWithdrawn || (isQspNotFound && member.status === "unknown") || isPermReadOnly;

  // 권한 옵션은 권한관리 테이블에서 동적으로 가져온다 — SUPER_ADMIN/ADMIN 제외 + 활성(Y) 만
  // (Redmine #2178). 부여 불가 권한은 권한관리 화면에서 사용여부=N 으로 운영자가 제어.
  // 옵션 외 기존 권한(예: 비활성 처리된 SEKO 잔존)은 safeRole 폴백으로 보존되며 편집 UI 미노출.
  // 쿼리키는 권한관리 화면(activeOnly=true)과 동일 헬퍼를 공유 — 캐시 미스/invalidate 누락 방지.
  const {
    data: roles = [],
    isLoading: isRolesLoading,
    isError: isRolesError,
  } = useQuery<RoleApiItem[]>({
    queryKey: rolesQueryKey(true),
    queryFn: async () => {
      const res = await api.get<RolesResponse>("/roles", { params: { activeOnly: "true" } });
      return res.data.data;
    },
    staleTime: 60_000,
  });
  const roleOptions = roles
    .filter((r) => r.roleCode !== "SUPER_ADMIN" && r.roleCode !== "ADMIN")
    .map((r) => ({ value: r.roleCode, label: r.roleName }));
  const editableRoleValues = roleOptions.map((o) => o.value);
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

  // ユーザー権限 편집 활성 조건 — DetailRow.isForm 과 children 분기에서 동일 식 중복 사용을 방지.
  // 회원유형이 GENERAL 이면 권한관리에서 사용여부=N 으로 비활성화된 권한을 보유한 회원이라도
  // SelectBox 를 노출해 활성 권한으로 전환 가능하게 한다 (Redmine: ck_choi 같은 GENERAL=N 회원
  // 의 권한을 관리자가 변경할 수 있어야 함). SelectBox value 는 비활성 권한일 때 빈값으로
  // 매핑되어 "選択" placeholder 가 표시된다 (아래 SelectBox value 분기 참고).
  // 옵션 로딩 실패(isRolesError) 시에는 편집 UI 자체를 숨겨 빈 SelectBox 로 인한 권한 누락 저장을 차단(PR #130 리뷰).
  const canEditUserRole =
    isGeneral &&
    !isReadOnly &&
    (!isQspNotFound || isRestoringToActive) &&
    !isRolesError;
  // 옵션 로딩 중 SelectBox disabled — 첫 진입 race window 의 빈 옵션 깜빡임 방지.
  const isRoleSelectDisabled = isRolesLoading;

  const handleSave = () => {
    // 화면설계서 기준 편집 허용 필드 (2026-04-28 정책 갱신):
    //   · twoFactorEnabled / attributeChangeNotification / newsRcptYn / loginNotification — 전 회원 유형
    //   · status — GENERAL 전용 (SEKO 는 회원관리 대상 아님)
    //   · userRole — GENERAL
    // payload 에 불허 필드를 포함하면 BE 화이트리스트에서 400 거부되므로 유형별로 분기 구성.
    const payload: MemberUpdatePayload = {
      attributeChangeNotification: attributeNotify,
      newsRcptYn,
      loginNotification,
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
    // 편집 가능 조건은 UI 의 SelectBox 활성 조건과 동일해야 한다 — canEditUserRole 단일 변수 재사용.
    // 비활성(N) 권한 회원의 SelectBox 가 빈값("選択") 상태에서 저장되는 경우를 클라이언트에서 차단:
    //   - BE round-trip + 일반화된 400 응답 메시지 노출 회피
    //   - "권한을 선택해주세요" 명확한 안내로 운영자 UX 개선
    if (canEditUserRole) {
      if (!userRole || !editableRoleValues.includes(userRole)) {
        openAlert({ type: "alert", message: "ユーザー権限を選択してください。" });
        return;
      }
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
                  {/* 갱신일시 없이 갱신자명만 표시되는 데이터 오류 방어:
                      updatedAt 이 존재할 때만 updatedBy 를 함께 표시한다. */}
                  {member.updatedAt && member.updatedBy && (
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
                    // GENERAL 회원 일반 수정 경로 + 복구 경로(isRestoringToActive) 에서 편집 가능.
                    // 비활성(N) 권한 보유 회원도 SelectBox 노출 → "選択" placeholder + 활성 권한 변경.
                    isForm: canEditUserRole,
                    children: canEditUserRole ? (
                      <SelectBox
                        options={roleOptions}
                        // 복구 경로 + 기존 SEKO 처럼 옵션 외 값은 SelectBox value 로 빈 문자열을 전달해
                        // "선택 없음" 상태를 명시적으로 표시 → 관리자가 반드시 재선택하게 유도.
                        // 실제 state(userRole) 는 그대로 보존되어 저장 시 서버 검증(400) 과 조합됨.
                        value={editableRoleValues.includes(userRole) ? userRole : ""}
                        onChange={setUserRole}
                        placeholder="選択"
                        // 옵션 로딩 중 disabled — 빈 옵션 상태로 "GENERAL" 자동선택되는 race 차단.
                        disabled={isRoleSelectDisabled}
                        className="w-full"
                      />
                    ) : isRolesError ? (
                      // /api/roles 호출 실패 시 SelectBox 미표시 + 운영자에게 원인 명시.
                      // (드롭다운 강제 노출 금지: 빈 옵션으로 권한 변경 시도되면 BE 400 으로 반려되지만
                      //  사용자에게 "이유 없는 실패" 로 보여 운영성 저하)
                      <TextValue value="権限一覧を取得できませんでした" />
                    ) : (
                      // userRole(권한) 과 userType(회원유형) 은 서로 다른 도메인 — 권한 미설정
                      // 시 회원유형으로 폴백하면 의미론적으로 잘못된 표시가 된다(会員タイプ 행과
                      // 중복 노출되기도 함). 라벨 매핑 → 원본 코드 → "-" 순으로 정직하게 표시.
                      // TODO: 非GENERAL 의 userRole 이 QSP 응답에서 빈 값으로 도착하는 근본 원인을
                      //       BE 에서 해결할 것 (다음 스프린트 추적 대상).
                      <TextValue value={ROLE_LABEL_MAP[member.userRole] || member.userRole || "-"} />
                    ),
                  }}
                />
                {/* 4행: Email / 部署名 */}
                <DetailRow
                  left={{ label: "Email", children: <TextValue value={member.email} /> }}
                  right={{ label: "部署名", children: <TextValue value={member.department} /> }}
                />
                {/* 5행: 最近アクセス / 役職 */}
                {/* 最近アクセス: QSP loginDt → lastLoginAt 매핑. 값 없으면 "-".
                    과거 updatedAt(레코드 갱신 시각) 로 fallback 했으나 의미가 달라(접속 ≠ 갱신)
                    혼동 소지 제거. */}
                <DetailRow
                  left={{
                    label: "最近アクセス",
                    children: (
                      <TextValue
                        value={member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "-"}
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
                    // 로그인 알림은 전 회원 유형 편집 가능 (2026-04-28 정책 갱신).
                    // 읽기전용(isReadOnly) 경로에서만 TextValue 로 표시.
                    children: !isReadOnly ? (
                      <div className="flex items-center gap-3">
                        <Radio name="loginNotify" value="true" checked={loginNotification} onChange={() => setLoginNotification(true)} label="有効" />
                        <Radio name="loginNotify" value="false" checked={!loginNotification} onChange={() => setLoginNotification(false)} label="無効" />
                      </div>
                    ) : (
                      <TextValue value={loginNotification ? "有効" : "無効"} />
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
