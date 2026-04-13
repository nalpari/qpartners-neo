"use client";

import { useState } from "react";
import Image from "next/image";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Button, DimSpinner, Spinner } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import type { LoginUser } from "@/lib/schemas/auth";
import { MypageInfoCorporate } from "./mypage-info-corporate";
import { MypageInfoMember } from "./mypage-info-member";
import { MypageInfoConstruction } from "./mypage-info-construction";

// Design Ref: §2 — API 응답 타입
export interface ProfileData {
  userType: "ADMIN" | "STORE" | "SEKO" | "GENERAL";
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

function createEditFormData(profile: ProfileData): EditFormData {
  return {
    compNm: profile.compNm || "",
    compNmKana: profile.compNmKana || "",
    zipcode: profile.zipcode || "",
    address1: profile.address1 || "",
    address2: profile.address2 || "",
    telNo: profile.telNo || "",
    fax: profile.fax || "",
    sei: profile.sei || "",
    mei: profile.mei || "",
    seiKana: profile.seiKana || "",
    meiKana: profile.meiKana || "",
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
      openAlert({
        type: "alert",
        message: "保存されました。",
        onConfirm: () => {
          setIsEditing(false);
          setEditData(null);
          queryClient.invalidateQueries({ queryKey: ["mypage", "profile"] });
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
          {isEditing ? "私の情報/会社情報の修正" : "私の情報/会社情報"}
        </h2>
        {!isEditing && userType && (
          <div className="hidden lg:block">
            <Button variant="primary" className="w-[68px]" onClick={handleStartEdit}>
              修正
            </Button>
          </div>
        )}
        {!isEditing && userType && (
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
