/**
 * 콘텐츠 가시성 · 분류축(facet) 필터 공용 헬퍼 — 검색기능 고도화 Phase 3.
 *
 * `/api/contents` GET 이 직접 들고 있던 판정 조건 중, 신규 라우트
 * (`/api/products`, `/api/products/[id]`, `/api/search/suggest`) 가 같은 규칙으로
 * 동작해야 하는 부분만 끌어냈다. 라우트마다 복사하면 게시기간 비교 기준이
 * 서로 어긋나서 "목록에는 보이는데 자동완성에는 안 뜨는" 류의 불일치가 난다.
 *
 * 사내 사용자 분기(internalOnly / roleCode 필터)는 관리 목적 전용이라
 * `/api/contents` 에 그대로 남겨 두었다 — 여기에는 **비사내 노출 규칙**만 둔다.
 */

import type { Prisma } from "@/generated/prisma/client";

import { jstHourStart } from "@/lib/jst-day";
import { prisma } from "@/lib/prisma";

/**
 * 비사내 사용자에게 노출 가능한 콘텐츠 조건 — 게시대상 매칭 + 게시기간.
 *
 * 노출기간 시각 비교 기준은 `canAccessContent`(auth.ts) 와 동일하다.
 * 종료는 "그 시간대의 끝까지" — 저장값이 정각이라 현재 시각도 정각으로 내려 비교한다
 * (`23時` 지정 = 24:00 까지).
 *
 * @param roleCode 조회자 권한코드. 비로그인은 `null` (= 비회원 게시대상 행 매칭)
 * @param now      where 절 전체가 공유하는 시각 스냅샷
 */
export function publishedTargetFilter(
  roleCode: string | null,
  now: Date,
): Prisma.ContentWhereInput {
  return {
    targets: {
      some: {
        roleCode,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: jstHourStart(now) } }] },
        ],
      },
    },
  };
}

/** 축 하나의 묶음 — 1Depth 축 id 와 그 안에서 체크된 2Depth id 목록 */
export interface FacetGroup {
  axisId: number;
  categoryIds: number[];
}

export interface FacetConditions {
  groups: FacetGroup[];
  conditions: Prisma.ContentWhereInput[];
}

/** 분류축 필터 입력 상한 — 선택 ID 가 그대로 IN 절 길이가 되므로 방어적으로 자른다. */
export const FACET_ID_LIMIT = 200;

/**
 * 분류축(facet) 필터 조건 생성 — 목업 `passesFacets()` 의 서버 구현.
 *
 * 축(軸) = 1Depth 카테고리, 선택지 = 그 아래 2Depth 카테고리다.
 * 결합 규칙은 목업과 동일하게 **축 안에서는 OR, 축 사이는 AND** 다.
 * (기존 `categoryIds` 파라미터는 선택 전부를 AND 로 묶는 교집합 검색이라 의미가 다르다 —
 *  현행 목록 화면이 쓰고 있어 그대로 두고, 신규 사이드바는 이 축 방식을 쓴다.)
 *
 * **받은 id 가 있는 축만 조건이 된다** (계획서 §27.3, 2026-10-23 사용자 확정):
 * - id 가 **하나도 없는 축** → 그 축은 조건이 아니다. 거르지 않는다.
 * - id 가 있으면 → 그 선택지에 **실제로 연결된** 자료만 남는다.
 *
 * 그래서 「선택지를 하나씩 켜 나간 누적」과 「그 축을 전부 체크한 결과」가 정확히 일치한다.
 *
 * ⚠️ **화면의 체크 상태와 이 함수의 입력은 1:1 이 아니다.** 화면 초기 상태는 전 축 전부
 * 체크이고 state 는 `null`(미설정)인데, `contents-contents.tsx` 의 `facetParams` 가 그
 * `null` 을 **각 축의 전체 id 로 펼쳐서** 보낸다. 전부 해제한 축만 id 가 비어 여기서 조건에서
 * 빠진다. 즉 「전부 해제 = 그 축만 AND 조건에서 제외」라는 §27.3 규칙은 **클라이언트가 조립하고
 * 이 함수가 받는다.**
 *
 * ⚠️ 조건이 걸린 축은 **그 축에 분류가 하나도 없는 자료를 탈락시킨다.** 개발 DB 는 5개 축에
 * 모두 분류를 가진 published 자료가 2,459건 중 21건뿐이라 초기 화면이 21건으로 보인다
 * (2026-10-26 실측) — 데이터 상태이며 구현 문제가 아니다.
 *
 * 결정 이력: 2026-10-13 에는 「초기 = 전 축 체크 해제」였고(목업
 * `axisPass(set,value){return set.has(value)}` 를 뒤집은 것), 10-23 에 「전부 체크·일부 체크는
 * AND 대상 / 전부 해제만 제외」로 교체되었다. 회귀 방어는
 * `scripts/e2e/search-facets.e2e.mjs` 6케이스가 담당한다.
 *
 * @param categoryIds    조건으로 쓸 2Depth 카테고리 id 목록 (클라이언트가 조립한 결과)
 * @returns AND 로 합칠 Prisma 조건과 축별 묶음. 빈 배열이면 빈 조건.
 */
export async function resolveFacetConditions(
  categoryIds: number[],
): Promise<FacetConditions> {
  const selectedIds = [...new Set(categoryIds)].slice(0, FACET_ID_LIMIT);
  if (selectedIds.length === 0) return { groups: [], conditions: [] };

  // 선택값의 부모(=축)로 묶는다. 축 목록(`axisIds`)은 더 이상 조건을 만들지 않으므로
  // (체크가 없는 축은 조건이 아니다) 여기서는 부모 조회만으로 충분하다.
  const rows = await prisma.category.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, parentId: true },
  });

  const selectedByAxis = new Map<number, number[]>();
  for (const row of rows) {
    if (row.parentId === null) {
      // 1Depth 는 선택지가 아니라 축 자체다. 체크 대상이 될 수 없으므로 무시하고 기록만 남긴다.
      console.warn("[resolveFacetConditions] 1Depth 카테고리가 선택값으로 전달됨 — 무시", {
        categoryId: row.id,
      });
      continue;
    }
    const bucket = selectedByAxis.get(row.parentId);
    if (bucket) bucket.push(row.id);
    else selectedByAxis.set(row.parentId, [row.id]);
  }

  const groups: FacetGroup[] = [];
  const conditions: Prisma.ContentWhereInput[] = [];
  for (const [axisId, selected] of selectedByAxis) {
    groups.push({ axisId, categoryIds: selected });
    // 축 안은 OR(IN), 축 사이는 AND(조건을 따로 push). 체크된 선택지에 실제로 연결된 자료만.
    conditions.push({ categories: { some: { categoryId: { in: selected } } } });
  }

  return { groups, conditions };
}
