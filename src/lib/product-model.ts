/**
 * 형번(제품) 공용 — 노출 조건 · 응답 select. 검색기능 고도화 Phase 3.
 *
 * 형번관리(관리자) · 제품일람 · 제품상세 · 자동완성 · 자료상세 패널이 모두
 * 같은 "이 형번을 이용자에게 보여도 되는가" 판정을 쓰도록 한 군데에 둔다.
 */

import { NextResponse } from "next/server";

import type { Prisma, ProductModelStatus } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * 형번 노출 조건 — 제품일람·자동완성·제품상세·자료상세 패널 공용.
 *
 * - `isVisible=false` 형번은 이용자 화면에 내보내지 않는다 (REQ-007 방침2 —
 *   콘텐츠 등록 폼에서는 선택할 수 있어야 하므로, 그쪽은 이 필터를 쓰지 않는다).
 * - 카테고리 게이트는 목업 `PRODUCT_LIST_CATS` / `INACTIVE_CATS` 와 동일:
 *   제품일람 대상(`isProductList`) + 카테고리 사용중(`isActive`) + 1Depth 부모도 사용중.
 *   사용중지(`isActive=false`) 카테고리의 형번은 **축에는 남기고 검색 조건에서만 제외**하는
 *   것이 목업 정책이라, 이 필터는 조회 결과에서 빼는 역할만 한다.
 * - 비사내 사용자에게는 사내전용 카테고리의 형번을 숨긴다 (카테고리명 자체가 새어 나간다).
 */
export function productModelVisibilityFilter(
  internal: boolean,
): Prisma.ProductModelWhereInput {
  return {
    isVisible: true,
    category: {
      isProductList: true,
      isActive: true,
      parent: { isActive: true, ...(internal ? {} : { isInternalOnly: false }) },
      ...(internal ? {} : { isInternalOnly: false }),
    },
  };
}

/**
 * 자료(콘텐츠)의 제품상태 — **연결된 형번에서 파생**한다 (요구사항정의서 v1.1 REQ-005).
 *
 * 자료는 제품상태를 직접 갖지 않는다. 판정 규칙은 요구사항 원문 그대로다:
 *   - 연결 형번 중 **하나라도** `current` → `"current"` (現行品)
 *   - 연결 형번이 **전부** `eol`        → `"eol"`     (販売終了品)
 *   - 연결 형번이 **없음**             → `null`      (화면에서 「-」)
 *
 * 이렇게 두면 단종 처리가 형번관리 한 곳으로 모인다. 종전 구현은 제품상태를 콘텐츠의
 * 분류축(카테고리 `PRDST`)으로 갖고 있어, 단종 시 자료를 하나씩 고쳐야 했고 누락된 자료가
 * 「단종인데 現行品 으로 표시」되는 상태로 남았다.
 *
 * ⚠️ 입력은 **그 자료에 연결된 형번 전부**여야 한다. 비표시(`isVisible=false`) 형번을
 * 제외한 목록을 넘기면 판정이 달라진다 — 비표시 형번이 유일한 現行品 일 때 단종품으로
 * 뒤집힌다. 노출 판정(`productModelVisibilityFilter`)과 상태 파생은 목적이 다르다.
 *
 * @param models 연결된 형번의 상태 목록 (빈 배열이면 `null`)
 */
export function deriveProductStatus(
  models: { status: ProductModelStatus }[],
): ProductModelStatus | null {
  if (models.length === 0) return null;
  return models.some((m) => m.status === "current") ? "current" : "eol";
}

/** 형번 응답에 함께 실는 카테고리 select (1Depth 부모명까지) */
export const PRODUCT_MODEL_CATEGORY_SELECT = {
  select: {
    id: true,
    categoryCode: true,
    name: true,
    isActive: true,
    isProductList: true,
    // 제품일람 정렬 키 — REQ-005 「카테고리 표시순서 → 형번 오름차순」
    sortOrder: true,
    // 사내전용 적색 표기(전 화면 공통) 용 — 노출 판정은 productModelVisibilityFilter 가 맡는다.
    isInternalOnly: true,
    parent: {
      select: {
        id: true,
        categoryCode: true,
        name: true,
        isActive: true,
        isInternalOnly: true,
        // 1Depth 표시순서 — 제품일람 1차 정렬 키
        sortOrder: true,
      },
    },
  },
} as const;

/** 형번명 정렬 비교자 — 목업 `titleCollator` 와 동일 기준(일본어, 숫자 인식, 대소문자 무시) */
export const modelCodeCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

/**
 * 콘텐츠에 연결할 형번 id 들이 실제로 존재하는지 확인한다.
 *
 * 없는 id 를 그대로 INSERT 하면 FK 위반(P2003)이 나는데, 그 예외는 "어느 id 가 문제인지"를
 * 응답에 담기 어려워 500 으로 수렴한다. 저장 전에 세어 400 으로 되돌린다.
 *
 * **표시여부는 보지 않는다** — 비표시 형번도 등록 폼에서 선택할 수 있어야 한다(REQ-007 방침2).
 *
 * @returns 전부 존재하면 `null`, 아니면 400 응답
 */
export async function assertProductModelIds(
  ids: number[],
): Promise<NextResponse | null> {
  if (ids.length === 0) return null;

  // 중복을 **먼저** 가려낸다. `IN` 은 같은 id 를 한 건으로 세므로, 중복을 그대로 아래
  // 건수 비교에 넘기면 멀쩡한 형번인데 「존재하지 않는 형번」으로 거부된다 — 원인을
  // 가리는 메시지였다(2026-10-29 사용자 지적). 화면은 체크박스라 중복이 생기지 않고,
  // API 직접 호출·일괄 등록 경로에서만 나온다.
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    console.warn("[assertProductModelIds] 중복된 형번 id 포함", {
      requested: ids.length,
      unique: unique.size,
    });
    return NextResponse.json(
      { error: "すでに資料に紐づけられている型番が重複しています" },
      { status: 400 },
    );
  }

  const found = await prisma.productModel.count({ where: { id: { in: ids } } });
  if (found === ids.length) return null;

  console.warn("[assertProductModelIds] 존재하지 않는 형번 id 포함", {
    requested: ids.length,
    found,
  });
  return NextResponse.json({ error: "存在しない型番が含まれています" }, { status: 400 });
}
