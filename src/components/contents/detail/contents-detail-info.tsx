"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useAlertStore } from "@/lib/store";

// Design Ref: §4.2 — approverLevel 라벨 변환
const APPROVER_LABELS: Record<number, string> = {
  1: "担当者",
  2: "課長",
  3: "事業部長",
};

interface ContentsDetailInfoProps {
  viewCount: number;
  authorDepartment: string | null;
  createdBy: string;
  updatedBy: string | null;
  approverLevel: number | null;
  /** 관리정보 테이블 노출 여부 — 사내직원(ADMIN)만 true */
  showManagement: boolean;
  /** 상단 메타 우측에 표시할 기능 버튼 슬롯 (PC 전용) */
  actions?: ReactNode;
}

export function ContentsDetailInfo({
  viewCount,
  authorDepartment,
  createdBy,
  updatedBy,
  approverLevel,
  showManagement,
  actions,
}: ContentsDetailInfoProps) {
  const { openAlert } = useAlertStore();
  const [infoOpen, setInfoOpen] = useState(true);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      openAlert({ type: "alert", message: "URLがコピーされました。" });
    } catch (error: unknown) {
      console.error("[Contents] URL 복사 실패:", error);
      openAlert({ type: "alert", message: "URLのコピーに失敗しました。" });
    }
  };

  // 빈값(null/undefined/"") → "-" 표시
  const orDash = (v: string | null | undefined) => (v && v.trim() !== "" ? v : "-");
  const fields = [
    { label: "担当部門", value: orDash(authorDepartment) },
    { label: "掲載担当者", value: orDash(createdBy) },
    { label: "更新担当者", value: orDash(updatedBy) },
    { label: "最終承認者", value: approverLevel != null ? (APPROVER_LABELS[approverLevel] ?? `Lv.${approverLevel}`) : "-" },
  ];

  return (
    <>
      {/* 상단 메타 + 우측 기능 버튼 (PC) */}
      <div className="pt-6 lg:pt-0 pb-2 lg:pb-0 px-6 lg:px-0 w-full lg:w-[1440px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 pl-1">
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010]">
              景色{" "}
              <span className="font-semibold text-[#E97923]">
                {viewCount.toLocaleString()}
              </span>
              件
            </p>
            <div className="bg-[#DDE3E8] w-px h-3" />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-[6px] cursor-pointer"
            >
              <Image
                src="/asset/images/contents/copy_link_icon.svg"
                alt=""
                width={20}
                height={20}
              />
              <span className="font-['Noto_Sans_JP'] text-[14px] leading-normal text-[#101010]">
                URLコピー
              </span>
            </button>
          </div>
          {actions && (
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* 관리정보 (사내직원만 노출) */}
      {showManagement && (
        <>
      {/* PC: 관리정보 4열 테이블 */}
      <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] p-6 w-[1440px]">
        <div className="flex gap-1">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-1 gap-1 h-[58px]">
              <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
                <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap truncate">
                  {field.label}
                </span>
              </div>
              <div className="flex-1 flex items-center bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2">
                <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                  {field.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MO: 관리정보 세로 카드 (토글) */}
      <div className="block lg:hidden bg-white px-6 py-6 w-full">
        <button
          type="button"
          onClick={() => setInfoOpen((prev) => !prev)}
          className="flex items-center gap-[10px] w-full cursor-pointer"
          aria-expanded={infoOpen}
          aria-controls="info-panel"
        >
          <p className="flex-1 text-left font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
            管理情報/公開対象
          </p>
          <Image
            src="/asset/images/contents/content_toggle.svg"
            alt=""
            width={32}
            height={32}
            className={`transition-transform duration-200 ${infoOpen ? "" : "rotate-180"}`}
          />
        </button>

        <div
          id="info-panel"
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: infoOpen ? "1fr" : "0fr" }}
          aria-hidden={!infoOpen}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-[18px] mt-6">
              {fields.map((field, idx) => (
                <div
                  key={field.label}
                  className={`flex flex-col gap-2 ${
                    idx > 0 ? "border-t border-[#EFF4F8] pt-[18px]" : ""
                  }`}
                >
                  <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F]">
                    {field.label}
                  </p>
                  <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </>
  );
}
