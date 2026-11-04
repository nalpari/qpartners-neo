"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { CategoryName } from "@/components/common";


/** 자료상세에 내려오는 紐づく型番 1건 — `GET /api/contents/:id` 의 `productModels` */
export interface DetailProductModel {
  id: number;
  modelCode: string;
  /** 제품상태 — 서버가 `PRODUCT_MODEL_PUBLIC_SELECT` 로 이미 내려준다 (Redmine #2755) */
  status: "current" | "eol";
  /** 표시/숨김 — 숨김 형번은 **사내 사용자에게만** 내려온다 (Redmine #2755) */
  isVisible: boolean;
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
 * 연결이 **없으면 영역 자체가 사라진다** (Redmine #2758). 종전에는 「特定の型番には
 * 紐づいていません。」 문구를 띄웠다 — 목업은 자료의 범위(형번고유 / 카테고리공통 /
 * 제품분류외)에 따라 두 문구를 갈라 쓰지만 neo 에는 그 범위 개념이 없어 하나만 썼고,
 * 이제는 그 문구도 쓰지 않는다.
 */
export function ContentsDetailProductModels({
  productModels,
}: ContentsDetailProductModelsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Redmine #2758 — 연결된 형번이 없으면 **영역 자체를 내지 않는다.** 종전에는
  // 「特定の型番には紐づいていません。」 문구를 띄웠다.
  //
  // 권한 분기는 서버가 이미 끝냈다 — 비사내 사용자에게는 숨김 형번이 내려오지 않으므로
  // (`/api/contents/[id]` 의 `productModelVisibilityFilter`), **숨김 형번만 연결된 자료**는
  // 비사내에게 0건이 되어 영역이 사라지고 사내에게는 그대로 보인다. 요구의
  // 「숨김 품번이 있을 땐 관리자한테는 표시하고, 판매점에는 숨김」이 그대로 성립한다.
  if (productModels.length === 0) return null;

  const body = (
    <div className="flex flex-wrap gap-2">
      {productModels.map((model) => (
        <Link
          key={model.id}
          href={`/products/${model.id}`}
          transitionTypes={["fade"]}
          className="flex items-center gap-[7px] rounded-[6px] border border-[#EAF0F6] bg-[#FDFEFE] px-3 py-2 transition-colors hover:border-[#246097] hover:bg-[#F7F9FB]"
        >
          <span className="font-mono text-[14px] font-semibold text-[#1060B4]">
            {model.modelCode}
          </span>
          <span aria-hidden className="text-[12px] text-[#C2CDDB]">
            |
          </span>
          {/* Redmine #2755 — **2Depth 만** 표시한다. 종전에는 `CategoryPath` 로
              「제품분류 > 태양전지모듈」처럼 1Depth 까지 찍었다.
              `CategoryName` 을 쓰는 이유는 사내전용 카테고리 적색 규칙을 유지하기 위함이다. */}
          <CategoryName
            category={model.category}
            className="font-['Noto_Sans_JP'] text-[12px] text-[#6a88a9]"
          />
          <span aria-hidden className="text-[12px] text-[#C2CDDB]">
            |
          </span>
          {/* Redmine #2755 — 제품상태를 함께 낸다. 배지가 아니라 **흐린 텍스트**다 —
              칩 안에서 배지를 쓰면 형번명보다 눈에 띈다(카테고리와 같은 톤으로 맞춘다). */}
          <span className="font-['Noto_Sans_JP'] text-[12px] text-[#6a88a9]">
            {model.status === "eol" ? "販売終了品" : "現行品"}
          </span>
          {/* Redmine #2755 — 숨김 형번은 끝에 **적색**으로 표식한다.
              서버가 비사내 사용자에게는 숨김 형번을 내려주지 않으므로
              (`productModelVisibilityFilter`) 이 표식은 사내에게만 보인다. */}
          {!model.isVisible && (
            <>
              <span aria-hidden className="text-[12px] text-[#C2CDDB]">
                |
              </span>
              <span className="font-['Noto_Sans_JP'] text-[12px] font-semibold text-[#ff1a1a]">
                非表示
              </span>
            </>
          )}
        </Link>
      ))}
    </div>
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
