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
  /**
   * **고른 것이 있었는데 조건이 하나도 안 남았다** — 호출부는 조회하지 말고 0건을 반환해야 한다.
   *
   * 예외처리 ③ 이 공개 자료 0건인 선택지를 걸러낸 결과 유효한 체크가 0개가 된 경우다.
   * 이걸 그냥 `conditions: []` 로 돌려주면 호출부가 「조건 없음」으로 받아 **전건**이 나간다 —
   * 체크 1개만 켜져 있는데 published 전건이 보인다(2026-11-03 화면 확인에서 드러남).
   * 유효 체크가 0개면 「전부 해제」와 같은 상태이므로 예외처리 ② 를 따라 0건이 맞다.
   *
   * 입력 자체가 비어 있는 경우(= 전부 체크, ①)와는 **다르다.** 그쪽은 조건 없음이 맞다.
   */
  unsatisfiable: boolean;
}

/** 분류축 필터 입력 상한 — 선택 ID 가 그대로 IN 절 길이가 되므로 방어적으로 자른다. */
export const FACET_ID_LIMIT = 200;

/** 연결 자료 0건 선택지를 조건에서 걸러낼 때 쓰는 노출 범위 (Redmine #2745). */
export interface FacetScope {
  /** 사내 사용자 여부 — 사내는 게시대상·게시기간을 적용하지 않는다 */
  internal: boolean;
  /** 조회자 권한코드. 비로그인은 `null` */
  roleCode: string | null;
  /** where 절 전체가 공유하는 시각 스냅샷 */
  now: Date;
}

/**
 * 분류축(facet) 필터 조건 생성 — 목업 `passesFacets()` 의 서버 구현.
 *
 * 축(軸) = 1Depth 카테고리, 선택지 = 그 아래 2Depth 카테고리다.
 * 결합 규칙은 목업과 동일하게 **축 안에서는 OR, 축 사이는 AND** 다.
 * (기존 `categoryIds` 파라미터는 선택 전부를 AND 로 묶는 교집합 검색이라 의미가 다르다 —
 *  현행 목록 화면이 쓰고 있어 그대로 두고, 신규 사이드바는 이 축 방식을 쓴다.)
 *
 * **받은 id 가 있는 축만 조건이 된다**:
 * - id 가 **하나도 없는 축** → 그 축은 조건이 아니다. 거르지 않는다.
 * - id 가 있으면 → 그 선택지에 **실제로 연결된** 자료만 남는다.
 *
 * ⚠️ **「좌측영역 전체 선택」은 여기까지 오지 않는다** (2026-11-03 회의 확정, 예외처리 ①).
 * 전부 체크 상태에서는 `contents-contents.tsx` 의 `facetParams` 가 `facetCategoryIds` 를
 * **아예 보내지 않아** 분류 조건이 걸리지 않는다. 그래서 「전부 체크 = 전체 콘텐츠」와
 * 「축 사이 AND」가 양립한다 — AND 규칙을 바꾸는 게 아니라 AND 평가를 건너뛴다.
 * 이전에는 `null`(전부 체크)을 전체 id 로 펼쳐 보내 전부 체크도 AND 조건이 됐고, 그래서 분류가
 * 비어 있는 자료가 초기 화면에서 통째로 빠졌다 (Redmine #2747 — published 2,461건 중 표시
 * 4축을 모두 가진 24건만 남았다).
 *
 * ⚠️ 조건이 걸린 축은 **그 축에 분류가 하나도 없는 자료를 탈락시킨다.** 그래서 전부 체크에서
 * 한 칸만 꺼도 AND 가 되살아나 건수가 크게 떨어진다 — 2026-11-03 회의에서 **수용하기로
 * 결정**했다. 완화하려면 축마다 「未分類」 선택지를 두는 별건 작업이 필요하다.
 *
 * **예외처리 ③ (`scope` 지정 시)** — 공개 자료가 **한 건도 연결되지 않은 선택지**는 조건에서
 * 뺀다. 체크는 화면에 그대로 남는다 (형번과 달리 분류는 비활성화하지 않는다). 축 안이 OR 이라
 * 선택지 하나를 빼는 것만으로는 결과가 바뀌지 않고, **그 축의 체크가 전부 연결 0건일 때**
 * 비로소 달라진다 — 그 축이 조건에서 빠져 「체크했는데 0건」이 사라진다 (Redmine #2745).
 * 판정은 **전역**이다 — 키워드 결과 기준이 아니다. 「이번 검색 결과에 없는 분류」는
 * `resolveAvailableFacets` 기반 자동 체크 동기화가 담당한다.
 *
 * ⚠️ **③ 이 체크된 선택지를 전부 떨어뜨리면 `unsatisfiable` 로 신호한다 — 호출부는 0건이다.**
 * 공개 자료 0건인 선택지 하나만 체크한 상태가 그 경우다. 그대로 `conditions: []` 를 돌려주면
 * 호출부가 「조건 없음」으로 받아 **전건**이 나간다 — 체크 1개만 켜져 있는데 published 전건이
 * 보인다(2026-11-03 화면 확인에서 실제로 드러났다).
 *
 * ③ 의 기준은 형번 비활성화와 같다 — 「무의미한 선택지가 조회에 끼어들지 못하게」다. 그 선택지를
 * 뺀 뒤 **유효한 체크가 0개**면 「전부 해제」와 같은 상태이므로 예외처리 ② 를 따라 0건이 맞다.
 * 「체크했는데 0건」(Redmine #2745) 은 전체선택 상태의 문제였고 그건 ① 이 막는다 — 재발이 아니다.
 *
 * 개발 DB 실측: 비사내 사이드바 선택지 24개 중 공개 자료 0건이 3개
 * (`情報種別/その他`, `資料分類/各種申請書式・フォーマット`, `資料分類/カタログ`).
 *
 * ⚠️ ③ 의 집계는 `status: "published"` 로 고정이다 — 형번 `hasDocuments` 와 같은 기준을 쓰기
 * 위해서다. 사내 사용자가 `status=draft` 로 직접 호출하면 초안만 달린 선택지가 제거돼 그 축이
 * 빠지고 **결과가 요청보다 넓어질 수 있다.** 화면은 `status` 를 보내지 않아 도달하지 않는다 —
 * 닫으려면 `scope` 에 조회 상태를 실어 보내면 된다 (후속).
 *
 * 결정 이력: 2026-10-13 「초기 = 전 축 체크 해제」 → 10-23 「전부 체크·일부 체크는 AND 대상 /
 * 전부 해제만 축 제외」 → 11-03 「전부 체크는 조건 생략(①) / 전부 해제는 0건(②) / 연결 0건
 * 선택지는 조건 제외(③)」. 회귀 방어는 `scripts/e2e/search-facets.e2e.mjs` 가 담당한다.
 *
 * @param categoryIds 조건으로 쓸 2Depth 카테고리 id 목록 (클라이언트가 조립한 결과)
 * @param scope       예외처리 ③ 의 노출 범위. `null` 이면 ③ 을 적용하지 않는다 — 입력 id 가
 *                    이미 「조회 범위에 자료가 있는 것」으로 걸러져 있을 때만 쓴다
 *                    (`resolveAvailableFacets` 2패스)
 * @returns AND 로 합칠 Prisma 조건과 축별 묶음. 빈 배열이면 빈 조건.
 */
export async function resolveFacetConditions(
  categoryIds: number[],
  scope: FacetScope | null,
): Promise<FacetConditions> {
  const selectedIds = [...new Set(categoryIds)].slice(0, FACET_ID_LIMIT);
  // 입력이 비었으면 「전부 체크」(①)다 — 조건 없음이 맞다. `unsatisfiable` 과 구분된다.
  if (selectedIds.length === 0)
    return { groups: [], conditions: [], unsatisfiable: false };

  // 선택값의 부모(=축)로 묶는다. 축 목록(`axisIds`)은 더 이상 조건을 만들지 않으므로
  // (체크가 없는 축은 조건이 아니다) 여기서는 부모 조회만으로 충분하다.
  const rows = await prisma.category.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, parentId: true },
  });

  // 예외처리 ③ — 공개 자료가 연결된 선택지만 남긴다. 범위는 사이드바 형번의
  // `hasDocuments`(`/api/products/axis`) 와 **같아야 한다.** 갈라지면 「화면에서는 고를 수
  // 있는데 고르면 0건」이 분류축에서 되살아난다.
  //
  // `findMany` + `distinct` 가 아니라 `groupBy` 를 쓴다 — Prisma 의 `distinct` 는 MariaDB 로
  // 내려가지 않고 클라이언트 메모리에서 적용돼, 선택이 넓으면 링크 행 수천 건을 그대로
  // 전송받는다. 이 함수는 페이징·정렬마다 도는 핫 패스다.
  let linkedIds: Set<number> | null = null;
  if (scope) {
    const linked = await prisma.contentCategory.groupBy({
      by: ["categoryId"],
      where: {
        categoryId: { in: selectedIds },
        content: {
          status: "published",
          ...(scope.internal ? {} : publishedTargetFilter(scope.roleCode, scope.now)),
        },
      },
    });
    linkedIds = new Set(linked.map((row) => row.categoryId));
  }

  const selectedByAxis = new Map<number, number[]>();
  for (const row of rows) {
    if (row.parentId === null) {
      // 1Depth 는 선택지가 아니라 축 자체다. 체크 대상이 될 수 없으므로 무시하고 기록만 남긴다.
      console.warn("[resolveFacetConditions] 1Depth 카테고리가 선택값으로 전달됨 — 무시", {
        categoryId: row.id,
      });
      continue;
    }
    // ③ — 연결 자료가 없으면 조건에 넣지 않는다. 그 축의 선택이 전부 빠지면 아래 루프에 축
    // 자체가 등장하지 않아 「체크 0개인 축은 조건에서 제외」와 같은 결과가 된다.
    if (linkedIds && !linkedIds.has(row.id)) continue;
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

  // 고른 것이 있었는데 조건이 하나도 안 남았다 — ③ 이 전부 걸렀거나(공개 자료 0건 선택지만
  // 체크) 입력이 1Depth 뿐이었다. 어느 쪽이든 「조건이 될 수 있는 체크가 0개」이므로 0건이다.
  return { groups, conditions, unsatisfiable: conditions.length === 0 };
}

/**
 * 좌측 분류 체크 상태로 내려보낼 분류값 집계 — REQ-004 / Redmine #2748·#2752.
 *
 * **목록에 나온 자료가 가진 분류값**을 그대로 돌려준다. 검색의 순서가 이것이기 때문이다.
 *
 *   검색어 → 목록(검색어로 결정) → 좌측 체크(그 목록의 분류를 표시)
 *
 * 그래서 집계 모집합은 목록과 **같은** `axisFreeWhere`(키워드·상태·노출범위) 한 벌이고,
 * 조회도 한 번이다.
 *
 * ⚠️ **여기서 나온 체크를 다시 조회 조건으로 걸면 안 된다.** 어떤 축이 비어 있는 자료는 그
 * 축이 조건이 되는 순간 탈락해, 검색이 찾아낸 자료를 자동 체크가 도로 숨긴다 — `PHASE9-TEST`
 * 가 자동완성 3건인데 목록 2건이던 경로다(#2748, 빠지던 자료는 `情報種別` 가 비어 있었다).
 * 클라이언트가 `facetFromSearch` 로 그 구분을 들고 있다(`contents-contents.tsx`).
 *
 * 종전에는 조회를 두 번 돌렸다 — 1패스 분류값을 축 조건으로 걸고, 그 조건에서 살아남는
 * 자료의 분류값을 2패스로 다시 집계했다. 「체크는 켜졌는데 목록에 없다」(#2752)를 막으려던
 * 것인데, 그 불일치의 원인이 **체크를 조건으로 되걸던 것** 자체였다. 되걸기를 없앤 지금
 * 2패스는 목록보다 좁은 기준이라 오히려 틀린 값을 준다. 그래서 1패스만 남긴다.
 *
 * 반환값에는 사이드바에 없는 축(`製品ステータス`·비표시·사내전용)의 값도 섞여 있다.
 * 표시 축으로 거르는 것은 화면이 한다(`visibleFacetIds` 와 교집합).
 *
 * @param axisFreeWhere 축(분류·형번) 조건을 **뺀** 콘텐츠 where — 목록과 같은 모집합
 */
export async function resolveAvailableFacets(
  axisFreeWhere: Prisma.ContentWhereInput,
): Promise<{ categoryId: number }[]> {
  return prisma.contentCategory.findMany({
    where: { content: axisFreeWhere },
    select: { categoryId: true },
    distinct: ["categoryId"],
  });
}
