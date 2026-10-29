"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { CategoryPath } from "@/components/common";

/** 자료상세에 내려오는 紐づく型番 1건 — `GET /api/contents/:id` 의 `productModels` */
export interface DetailProductModel {
  id: number;
  modelCode: string;
  category: {
    id: number;
    name: string;
    /** 사내전용 카테고리 — 적색 표기 */
    isInternalOnly: boolean;
    parent: { id: number; name: string; isInternalOnly: boolean } | null;
  };
}

interface ContentsDetailProductModelsProps {
  productModels: DetailProductModel[];
}

/**
 * 紐づく型番 패널 — 검색 고도화 REQ-009 / 목업 01 자료상세 `.dmdl`.
 *
 * 서버가 이미 노출 범위를 걸러서 내려준다 — 비사내 사용자에게는 비표시(`isVisible=false`)
 * 형번과 제품일람 OFF·사용중지·사내전용 카테고리의 형번이 제외된다
 * (`/api/contents/[id]` 의 `productModelVisibilityFilter`). 그래서 여기서는 다시 걸러내지 않는다.
 *
 * 칩을 클릭하면 제품상세로 간다 (목업 `data-goto`).
 *
 * 연결이 없을 때의 문구는 **하나**다. 목업은 자료의 범위(`scope`: 형번고유 / 카테고리공통 /
 * 제품분류외)에 따라 두 문구를 갈라 쓰지만, neo 에는 그 범위 개념이 없다 — 자료는 형번에
 * 연결되거나 안 되거나 둘 중 하나다.
 */
export function ContentsDetailProductModels({
  productModels,
}: ContentsDetailProductModelsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const body =
    productModels.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {productModels.map((model) => (
          <Link
            key={model.id}
            href={`/products/${model.id}`}
            transitionTypes={["fade"]}
            className="flex items-center gap-2 rounded-[6px] border border-[#EAF0F6] bg-[#FDFEFE] px-3 py-2 transition-colors hover:border-[#246097] hover:bg-[#F7F9FB]"
          >
            <span className="font-mono text-[14px] font-semibold text-[#1060B4]">
              {model.modelCode}
            </span>
            <CategoryPath
              category={model.category}
              className="font-['Noto_Sans_JP'] text-[12px] text-[#6a88a9]"
            />
          </Link>
        ))}
      </div>
    ) : (
      <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#767676]">
        特定の型番には紐づいていません。
      </p>
    );

  return (
    <>
      {/* PC */}
      <div className="hidden lg:flex w-full max-w-[var(--page-max)] flex-col gap-4 rounded-[12px] bg-white px-6 pt-[34px] pb-6 shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
        <h2 className="font-['Noto_Sans_JP'] text-[15px] font-medium leading-normal text-[#101010]">
          紐づく型番
        </h2>
        {body}
      </div>

      {/* MO: 토글 — 카테고리 패널과 동일 패턴 */}
      <div className="block w-full bg-white px-6 py-6 lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full cursor-pointer items-center gap-[10px]"
          aria-expanded={isOpen}
          aria-controls="product-models-panel"
        >
          <p className="flex-1 text-left font-['Noto_Sans_JP'] text-[15px] font-medium leading-normal text-[#101010]">
            紐づく型番
          </p>
          <Image
            src="/asset/images/contents/content_toggle.svg"
            alt=""
            width={32}
            height={32}
            className={`transition-transform duration-200 ${isOpen ? "" : "rotate-180"}`}
          />
        </button>

        <div
          id="product-models-panel"
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
          aria-hidden={!isOpen}
        >
          <div className="overflow-hidden">
            <div className="mt-6">{body}</div>
          </div>
        </div>
      </div>
    </>
  );
}
