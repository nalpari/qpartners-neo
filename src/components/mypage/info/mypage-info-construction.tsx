"use client";

import { useState } from "react";
import Image from "next/image";
import type { ColDef } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid";
import { MobileCardList } from "@/components/common/mobile-card-list";
import type { MobileCardField } from "@/components/common/mobile-card-list";
import { Button } from "@/components/common";

const MOBILE_PAGE_SIZE = 5;

interface ConstructionId {
  id: string;
  acquiredDate: string;
  expiryDate: string;
  document: string;
  note: string;
}

const DUMMY_CONSTRUCTION_IDS: ConstructionId[] = Array.from(
  { length: 7 },
  (_, i) => ({
    id: `ID SampleNum${i + 1}`,
    acquiredDate: "2026.02.16",
    expiryDate: "2026.02.16",
    document: "受講料領収書",
    note: "施工店 (デルタ)",
  })
);

function DocumentCell({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-[12px]">
      <Image
        src="/asset/images/layout/download_icon.svg"
        alt=""
        width={16}
        height={18}
      />
      <span>{value}</span>
    </div>
  );
}

const columnDefs: ColDef<ConstructionId>[] = [
  { headerName: "施工ID", field: "id", flex: 1 },
  {
    headerName: "施工ID取得日",
    field: "acquiredDate",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
  {
    headerName: "建設IDの有効期限",
    field: "expiryDate",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
  {
    headerName: "ドキュメントダウンロード",
    field: "document",
    flex: 1,
    cellRendererSelector: () => ({ component: DocumentCell }),
  },
  {
    headerName: "備考",
    field: "note",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
];

const mobileFields: MobileCardField<ConstructionId>[] = [
  { label: "施工ID", key: "id" },
  { label: "施工ID取得日", key: "acquiredDate" },
  { label: "建設IDの有効期限", key: "expiryDate" },
  {
    label: "ドキュメントダウンロード",
    key: "document",
    render: (item) => (
      <div className="flex items-center gap-[12px]">
        <Image
          src="/asset/images/layout/download_icon.svg"
          alt=""
          width={16}
          height={18}
        />
        <span>{item.document}</span>
      </div>
    ),
  },
  { label: "備考", key: "note" },
];

export function MypageInfoConstruction() {
  const [mobileCount, setMobileCount] = useState(MOBILE_PAGE_SIZE);
  const mobileData = DUMMY_CONSTRUCTION_IDS.slice(0, mobileCount);
  const hasMore = mobileCount < DUMMY_CONSTRUCTION_IDS.length;

  return (
    <section className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] w-full lg:max-w-[1440px]">
      {/* 헤더 */}
      <div className="px-[24px] pt-[34px] pb-[18px] lg:px-[42px] lg:pb-[14px]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-[18px] lg:gap-[14px] w-full">
          <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] w-[82px]">
            施工ID情報
          </h3>
          <div className="flex gap-[6px] w-full lg:w-auto lg:ml-auto">
            <Button
              variant="primary"
              className="flex-1 lg:flex-none lg:w-[113px]"
              onClick={() => alert("WEB研修申請機能は準備中です")}
            >
              WEB研修申請
            </Button>
            <Button
              variant="secondary"
              className="flex-1 lg:flex-none lg:w-[160px]"
              onClick={() => alert("施工ID情報詳細確認機能は準備中です")}
            >
              施工ID情報詳細確認
            </Button>
          </div>
        </div>
      </div>

      {/* PC: DataGrid */}
      <div className="hidden lg:block px-[42px] pb-[42px]">
        <DataGrid columnDefs={columnDefs} rowData={DUMMY_CONSTRUCTION_IDS} />
      </div>

      {/* 모바일: MobileCardList (5개씩 표시) */}
      <div className="lg:hidden bg-[#F7F9FB] pb-[10px]">
        <MobileCardList
          data={mobileData}
          fields={mobileFields}
          keyExtractor={(item) => item.id}
        />
        {hasMore && (
          <button
            type="button"
            onClick={() =>
              setMobileCount((prev) => prev + MOBILE_PAGE_SIZE)
            }
            className="flex items-center justify-center gap-[8px] w-full bg-[#45576f] px-[24px] py-[18px]"
          >
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-white">
              もっと見る
            </span>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6 9L12 15L18 9"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
