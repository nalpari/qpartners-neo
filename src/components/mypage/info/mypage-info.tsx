"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/common";
import { MypageInfoCorporate } from "./mypage-info-corporate";
import { MypageInfoMember } from "./mypage-info-member";
import { MypageInfoConstruction } from "./mypage-info-construction";

export function MypageInfo() {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    alert("保存機能は準備中です");
    setIsEditing(false);
  };

  return (
    <section className="flex flex-col gap-[18px] items-center w-full">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-[12px] pb-[4px] w-full max-w-[1440px] px-[24px] lg:px-0 pt-[18px] lg:pt-0">
        {/* PC: myprofile_icon */}
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
        {/* PC: 修正 버튼 (조회 모드만) */}
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
        {/* 모바일: edit_icon (조회 모드만) */}
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

      {/* 법인정보 + 회원정보 카드 */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-[10px] lg:gap-[18px] w-full lg:max-w-[1440px]">
        <MypageInfoCorporate isEditing={isEditing} />
        <MypageInfoMember isEditing={isEditing} />
      </div>

      {/* 시공ID정보 (조회 모드만) */}
      {!isEditing && <MypageInfoConstruction />}

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
            className="flex-1 lg:flex-none  lg:w-[68px]"
            onClick={handleSave}
          >
            保存
          </Button>
        </div>
      )}
    </section>
  );
}
