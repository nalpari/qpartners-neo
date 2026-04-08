"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Button, Spinner } from "@/components/common";
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

export function MypageInfo() {
  const [isEditing, setIsEditing] = useState(false);
  const { openAlert } = useAlertStore();

  // Design Ref: §4.1 — 부모 컴포넌트 데이터 페칭
  const queryClient = useQueryClient();
  const loginUser = queryClient.getQueryData<LoginUser>(["auth", "login-user-info"]);

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["mypage", "profile"],
    queryFn: async () => {
      const res = await api.get<{ data: ProfileData }>("/mypage/profile");
      return res.data.data;
    },
  });

  const userType = profile?.userType ?? loginUser?.userTp ?? "GENERAL";
  const userId = loginUser?.userId ?? "";

  const handleSave = () => {
    openAlert({ type: "alert", message: "保存機能は準備中です" });
    setIsEditing(false);
  };

  return (
    <section className="flex flex-col gap-[18px] items-center w-full">
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
        {!isEditing && (
          <div className="hidden lg:block">
            <Button
              variant="primary"
              className="w-[68px]"
              onClick={() => setIsEditing(true)}
            >
              修正
            </Button>
          </div>
        )}
        {!isEditing && (
          <button
            type="button"
            className="lg:hidden shrink-0"
            onClick={() => setIsEditing(true)}
            aria-label="修正"
          >
            <Image
              src="/asset/images/contents/edit_icon.svg"
              alt="修正"
              width={36}
              height={36}
            />
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
          {/* 법인정보 + 회원정보 카드 */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-[10px] lg:gap-[18px] w-full lg:max-w-[1440px]">
            <MypageInfoCorporate profile={profile} userType={userType} isEditing={isEditing} />
            <MypageInfoMember profile={profile} userId={userId} userType={userType} isEditing={isEditing} />
          </div>

          {/* Design Ref: §4.3 — 시공ID정보: SEKO만 표시 */}
          {userType === "SEKO" && !isEditing && <MypageInfoConstruction />}

          {/* 하단 버튼 (수정 모드만) */}
          {isEditing && (
            <div className="flex gap-[6px] justify-center lg:justify-end w-full lg:max-w-[1440px] px-[24px] lg:px-0 pb-[28px] lg:pb-0">
              <Button
                variant="secondary"
                className="flex-1 lg:flex-none lg:w-[97px]"
                onClick={() => setIsEditing(false)}
              >
                キャンセル
              </Button>
              <Button
                variant="primary"
                className="flex-1 lg:flex-none lg:w-[68px]"
                onClick={handleSave}
              >
                保存
              </Button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
