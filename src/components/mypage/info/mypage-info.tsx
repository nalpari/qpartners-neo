"use client";

import { useState } from "react";
import Image from "next/image";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Button, DimSpinner, Spinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { MENU } from "@/lib/menu-codes";
import type { LoginUser } from "@/lib/schemas/auth";
import { MypageInfoCorporate } from "./mypage-info-corporate";
import { MypageInfoMember } from "./mypage-info-member";
import { MypageInfoConstruction } from "./mypage-info-construction";

// Design Ref: §2 — API 응답 타입
export interface ProfileData {
  userType: "ADMIN" | "STORE" | "SEKO" | "GENERAL";
  // 원본 단일 문자열 (Q.Order 매핑: 성명/성명 히라가나 1:1). split 실패 시 fallback 소스.
  userName: string | null;
  userNameKana: string | null;
  sei: string;
  mei: string;
  seiKana: string;
  meiKana: string;
  email: string;
  compNm: string;
  compNmKana: string;
  zipcode: string;
  address1: string;
  address2: string;
  telNo: string;
  fax: string;
  department: string | null;
  jobTitle: string | null;
  corporateNo: string | null;
  newsRcptYn: "Y" | "N";
  newsRcptDate: string | null;
  withdrawAvailable?: boolean;
}

// Design Ref: §3 — 수정 폼 데이터 타입
export interface EditFormData {
  compNm: string;
  compNmKana: string;
  zipcode: string;
  address1: string;
  address2: string;
  telNo: string;
  fax: string;
  sei: string;
  mei: string;
  seiKana: string;
  meiKana: string;
  department: string;
  jobTitle: string;
  newsRcptYn: "Y" | "N";
}

/**
 * 풀네임(userNm) 우선 split — BE 의 splitQspUserName 이 limit=2 로 자르면서 잃어버린
 * 회원명 후반부(예: `金 志映(2차인증:Y, 로그인:Y, 속성변경:Y, 뉴스레터 :Y)` 의 mei 측)를
 * 프론트에서 직접 풀텍스트로부터 첫 공백 1회만 분리해 복원한다.
 * userName 없을 때만 BE 의 sei/mei 폴백.
 */
function splitFullName(
  full: string | null,
  fallbackSei: string,
  fallbackMei: string,
): { sei: string; mei: string } {
  if (!full) return { sei: fallbackSei, mei: fallbackMei };
  const idx = full.search(/[\s　]/);
  if (idx < 0) return { sei: full, mei: "" };
  return { sei: full.slice(0, idx), mei: full.slice(idx + 1) };
}

function createEditFormData(profile: ProfileData): EditFormData {
  const name = splitFullName(profile.userName, profile.sei || "", profile.mei || "");
  const kana = splitFullName(profile.userNameKana, profile.seiKana || "", profile.meiKana || "");
  return {
    compNm: profile.compNm || "",
    compNmKana: profile.compNmKana || "",
    zipcode: profile.zipcode || "",
    address1: profile.address1 || "",
    address2: profile.address2 || "",
    telNo: profile.telNo || "",
    fax: profile.fax || "",
    sei: name.sei,
    mei: name.mei,
    seiKana: kana.sei,
    meiKana: kana.mei,
    department: profile.department || "",
    jobTitle: profile.jobTitle || "",
    newsRcptYn: profile.newsRcptYn,
  };
}

// Design Ref: §5 — userType별 필수 검증
function validateEditForm(data: EditFormData, userType: string): string[] {
  const errors: string[] = [];

  // SEKO: 뉴스레터만 수정 → 검증 불필요
  // ADMIN: 서버 superRefine에서 회사 필수 제외
  // GENERAL/STORE: 회사 필수 + GENERAL만 성명 필수
  if (userType === "GENERAL" || userType === "STORE") {
    if (!data.compNm.trim()) errors.push("会社名は必須です。");
    if (!data.zipcode.trim()) errors.push("郵便番号は必須です。");
    if (!data.address1.trim()) errors.push("住所は必須です。");
    if (!data.telNo.trim()) errors.push("電話番号は必須です。");
  }
  if (userType === "GENERAL") {
    if (!data.sei.trim()) errors.push("姓は必須です。");
    if (!data.mei.trim()) errors.push("名は必須です。");
    if (!data.seiKana.trim()) errors.push("姓(カナ)は必須です。");
    if (!data.meiKana.trim()) errors.push("名(カナ)は必須です。");
  }

  return errors;
}

export function MypageInfo() {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { openAlert } = useAlertStore();

  // RBAC — MYPAGE.canUpdate 매트릭스 가드. false → 修正 버튼/아이콘 사전 숨김.
  // 로딩 중에도 fail-closed (서버 PUT /api/mypage/profile 가 최종 방어선이라 UX 보호 목적).
  const { canUpdate: canUpdateMypage, isLoading: isPermLoading } = useMenuPermission(MENU.MYPAGE);
  const canShowEdit = !isPermLoading && canUpdateMypage;

  // Design Ref: §4.1 — 부모 컴포넌트 데이터 페칭
  const queryClient = useQueryClient();
  const { data: loginUser } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["mypage", "profile"],
    queryFn: async () => {
      const res = await api.get<{ data: ProfileData }>("/mypage/profile");
      return res.data.data;
    },
  });

  // 최소 권한 원칙: userType 불명 시 수정 불가 상태로 처리
  const userType = profile?.userType ?? loginUser?.userTp ?? null;
  const userId = loginUser?.userId ?? "";

  // Design Ref: §3 — 폼 상태 (profile 로딩 완료 후 초기화)
  const [editData, setEditData] = useState<EditFormData | null>(null);

  const handleStartEdit = () => {
    if (!profile) return;
    // RBAC 패턴 E — UI(canShowEdit) 와 핸들러 본체 이중 가드. 로딩 중 silent return.
    if (isPermLoading) return;
    if (!canUpdateMypage) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }
    setEditData(createEditFormData(profile));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  const updateField = (key: keyof EditFormData) => (value: string) => {
    setEditData((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  // Design Ref: §4 — 저장 로직
  const handleSave = async () => {
    if (!editData || !userType) return;

    // RBAC 패턴 E — 저장 본체에서도 권한 재검증 (UI 우회·race 차단).
    // 서버 PUT /api/mypage/profile 가 최종 방어선이라 보안은 안전, 본 분기는 UX 가드.
    if (isPermLoading) return;
    if (!canUpdateMypage) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }

    const errors = validateEditForm(editData, userType);
    if (errors.length > 0) {
      openAlert({ type: "alert", message: errors[0] });
      return;
    }

    // SEKO는 뉴스레터만 수정 가능 → 최소 payload 전송
    const payload = userType === "SEKO"
      ? { newsRcptYn: editData.newsRcptYn }
      : editData;

    setIsSaving(true);
    try {
      await api.put("/mypage/profile", payload);
      // editData/userType 은 onConfirm 비동기 실행 시점에 setEditData(null) 로 비워질 수 있어
      // alert 호출 전에 캐시 갱신용 스냅샷 확보.
      const snapshot = editData;
      const snapshotUserType = userType;
      openAlert({
        type: "alert",
        message: "保存されました。",
        onConfirm: () => {
          setIsEditing(false);
          setEditData(null);
          queryClient.invalidateQueries({ queryKey: ["mypage", "profile"] });

          // GNB 회사명/성명 즉시 반영 — 재로그인 없이 헤더·홈·콘텐츠 작성 폼 등
          // ["auth", "login-user-info"] 캐시 구독자 전체에 새 값 전파.
          //
          // setQueryData 만 사용 — invalidateQueries 는 사용하지 않는다:
          // - PUT /api/mypage/profile 응답이 새 JWT 를 Set-Cookie 했지만, invalidate 가
          //   트리거하는 fetchAuthMe refetch 가 일시적으로 cache 를 null 로 만들거나
          //   axios 인터셉터의 401 처리로 비로그인 UI 가 깜빡이는 결함이 관찰됨.
          // - 새 JWT 는 다음 새로고침/staleTime 경과 후 자연스럽게 적용되므로 invalidate
          //   불필요. 즉시성은 setQueryData 로 충분.
          //
          // GENERAL 외 회원유형(ADMIN/STORE/SEKO) 은 회사명/성명 수정 권한이 없어 서버에서
          // strip 되므로 클라이언트 캐시 갱신 대상 아님.
          if (snapshot && snapshotUserType === "GENERAL") {
            queryClient.setQueryData<LoginUser | null>(
              ["auth", "login-user-info"],
              (prev) => {
                if (!prev) return prev;
                const newUserNm = [snapshot.sei.trim(), snapshot.mei.trim()]
                  .filter(Boolean)
                  .join(" ");
                return {
                  ...prev,
                  compNm: snapshot.compNm.trim() || prev.compNm,
                  userNm: newUserNm || prev.userNm,
                  // 서버가 발급하는 새 JWT 의 deptNm 와 동일하게 캐시도 즉시 갱신.
                  // 누락 시 콘텐츠 작성 등 authorDepartment 참조 경로에서 stale 값 사용됨.
                  deptNm: snapshot.department.trim() || prev.deptNm,
                };
              },
            );
          }
        },
      });
    } catch (err: unknown) {
      console.error("[Mypage] 프로필 수정 실패:", err);
      if (isAxiosError(err) && err.response) {
        const status = err.response.status;
        if (status === 400) {
          openAlert({ type: "alert", message: "入力内容に不備があります。内容をご確認ください。" });
        } else if (status === 401) {
          openAlert({ type: "alert", message: "ログインが必要です。" });
        } else {
          openAlert({ type: "alert", message: "保存に失敗しました。しばらくしてからお試しください。" });
        }
      } else {
        openAlert({ type: "alert", message: "保存に失敗しました。しばらくしてからお試しください。" });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Design Ref: §2.1 — 법인정보 수정: GENERAL만 표시 (STORE/ADMIN/SEKO 숨김)
  // SEKO는 뉴스레터만 수정 가능하므로 법인정보 수정 제외
  const showCorporateEdit = userType === "GENERAL";

  return (
    <section className="flex flex-col gap-[18px] items-center w-full">
      {isSaving && <DimSpinner />}

      {/* 섹션 헤더 */}
      <div className="flex items-center gap-[12px] pb-[4px] w-full max-w-[1440px] px-[24px] lg:px-0 pt-[18px] lg:pt-0">
        <Image
          src="/asset/images/contents/myprofile_icon.svg"
          alt=""
          width={42}
          height={42}
          className="hidden lg:block shrink-0"
        />
        <h2 className="flex-1 font-['Noto_Sans_JP'] font-medium text-[18px] leading-[1.5] text-[#101010]">
          法人情報 / 会員情報
        </h2>
        {!isEditing && userType && canShowEdit && (
          <div className="hidden lg:block">
            <Button variant="primary" className="w-[68px]" onClick={handleStartEdit}>
              修正
            </Button>
          </div>
        )}
        {!isEditing && userType && canShowEdit && (
          <button
            type="button"
            className="lg:hidden shrink-0"
            onClick={handleStartEdit}
            aria-label="修正"
          >
            <Image src="/asset/images/contents/edit_icon.svg" alt="修正" width={36} height={36} />
          </button>
        )}
      </div>

      {/* 로딩/에러/데이터 분기 */}
      {isLoading ? (
        <div className="flex items-center justify-center w-full py-20">
          <Spinner size={48} />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center w-full py-20">
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#ff1a1a]">
            会員情報を読み込めませんでした。ページを再読み込みしてください。
          </p>
        </div>
      ) : profile ? (
        <>
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-[10px] lg:gap-[18px] w-full lg:max-w-[1440px]">
            {/* Design Ref: §6.1 — STORE/ADMIN은 수정 모드에서 법인정보 숨김 */}
            {(!isEditing || showCorporateEdit) && (
              <MypageInfoCorporate
                profile={profile}
                userType={profile.userType}
                isEditing={isEditing}
                editData={editData}
                updateField={updateField}
              />
            )}
            <MypageInfoMember
              profile={profile}
              userId={userId}
              userType={profile.userType}
              isEditing={isEditing}
              editData={editData}
              updateField={updateField}
            />
          </div>

          {profile.userType === "SEKO" && !isEditing && <MypageInfoConstruction />}

          {isEditing && (
            <div className="flex gap-[6px] justify-center lg:justify-end w-full lg:max-w-[1440px] px-[24px] lg:px-0 pb-[28px] lg:pb-0">
              <Button
                variant="secondary"
                className="flex-1 lg:flex-none lg:w-[97px]"
                onClick={handleCancelEdit}
              >
                キャンセル
              </Button>
              <Button
                variant="primary"
                className="flex-1 lg:flex-none lg:w-[68px]"
                onClick={() => { void handleSave(); }}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
