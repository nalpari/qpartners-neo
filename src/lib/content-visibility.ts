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
import { LEGACY_PRODUCT_STATUS_AXIS_CODE } from "@/lib/schemas/common";

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
  if (selectedIds.length === 0) return { groups: [], conditions: [] };

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

  return { groups, conditions };
}

/**
 * 좌측 분류 체크 상태로 내려보낼 분류값 집계 — REQ-004 / Redmine #2752.
 *
 * **목록에 실제로 보이는 자료가 가진 분류값만** 돌려준다. 두 단계로 센다.
 *   1패스 — 축 조건을 뺀 집합(`axisFreeWhere`: 키워드·상태·노출범위만)의 분류값.
 *           이 값들이 그대로 축 조건이 된다.
 *   2패스 — 그 축 조건을 적용했을 때 남는 자료의 분류값. 이것이 반환값이다.
 *
 * 1패스만 쓰면 목록에 없는 분류가 체크된 채 남는다. `nbc` 검색이 그 사례였다 —
 * 걸린 37건 중 13건이 `架台` 를 갖지만 그 13건은 `資料分類` 가 비어 축 조건에서 탈락한다.
 * 목록은 4건인데 `架台` 는 켜져 있었다(2026-11-02 실측).
 *
 * 2패스는 **고정점이라 더 돌릴 필요가 없다** — 남은 자료는 모두 그 분류값을 갖고 있어
 * 재조회해도 탈락하지 않고, 조건이 좁아졌으므로 새로 들어올 자료도 없다.
 *
 * ⚠️ **2패스가 0행이면 1패스를 돌려준다.** 고정점 성질은 2패스 생존 집합이 비지 않을 때만
 * 성립한다. `[]` 를 그대로 주면 클라이언트가 「전부 해제」로 읽어(`toFacetSelection([]) = []`
 * → `facetParams` 가 `facetCategoryIds` 를 아예 생략) 축 조건이 통째로 빠지고 목록이 오히려
 * **넓어진다** — #2752 의 역방향 불일치다. 0행은 「1패스 분류값을 전부 AND 로 걸면 생존
 * 자료가 없다」는 뜻이므로, 좁히기를 포기하고 1패스를 쓰는 아래 세 조기반환과 같게 다룬다.
 * 도달 가능성은 낮지 않다 — published 2,461건 중 표시 4축을 **모두** 가진 자료가 24건뿐이라
 * (2026-11-02 실측) 키워드 결과가 집합으로는 여러 축을 덮지만 한 건도 전 축을 못 갖는
 * 상태가 흔하다.
 *
 * ⚠️ 2패스 조건에는 **화면에 노출되는 축의 선택지만** 넣는다. 1패스 결과에는 사이드바에
 * 나오지 않는 축(`製品ステータス`·비표시·사내전용 축, 폐지된 `PVモジュールラインナップ`·
 * `架台メーカ` 등)의 값도 섞여 있어, 그대로 AND 로 걸면 조건이 과도하게 좁아져 2패스가
 * 0건이 된다(2026-11-02 실측). 축 선정 기준은 화면의 `resolveVisibleAxes` 와 같다.
 *
 * ⚠️ 1패스 결과가 `FACET_ID_LIMIT` 를 넘으면 `resolveFacetConditions` 가 잘라낸다.
 * 그만큼 축 조건이 느슨해져 2패스가 1패스에 가까워질 뿐, 결과가 틀리지는 않는다.
 *
 * @param axisFreeWhere 축(분류·형번) 조건을 **뺀** 콘텐츠 where
 * @param internal      사내 사용자 여부 — 사내전용 축·선택지를 조건에 넣을지 가른다
 */
export async function resolveAvailableFacets(
  axisFreeWhere: Prisma.ContentWhereInput,
  internal: boolean,
): Promise<{ categoryId: number }[]> {
  const first = await prisma.contentCategory.findMany({
    where: { content: axisFreeWhere },
    select: { categoryId: true },
    distinct: ["categoryId"],
  });
  if (first.length === 0) return first;

  const visibleIds = await prisma.category.findMany({
    where: {
      id: { in: first.map((row) => row.categoryId) },
      // 자식(2Depth)에도 `isActive` 를 건다. 화면 선택지는 `/api/categories?activeOnly=true`
      // 에서 오는데 그 쿼리는 **부모·자식 모두** 사용중인 것만 돌려준다. 여기서 자식 조건을
      // 빼면 「부모는 사용중, 2Depth 만 사용중지」인 분류가 서버 축 조건에만 들어가
      // 목록에 없는 값이 체크되는 #2752 증상이 그 축에서 재발한다.
      isActive: true,
      ...(internal ? {} : { isInternalOnly: false }),
      parent: {
        categoryCode: { not: LEGACY_PRODUCT_STATUS_AXIS_CODE },
        isVisible: true,
        isActive: true,
        ...(internal ? {} : { isInternalOnly: false }),
      },
    },
    select: { id: true },
  });
  if (visibleIds.length === 0) return first;

  // ③(연결 0건 선택지 제외)은 적용하지 않는다 — `visibleIds` 는 1패스 집계에서 나왔고, 그
  // 집계 모집합(`axisFreeWhere`)에 **실제로 존재하는 분류값**이라 재확인이 불필요하다.
  // ③ 을 걸면 기준이 `status: "published"` 로 고정돼, 사내 사용자의 초안 조회에서 오히려
  // 선택지가 깎인다.
  const { conditions } = await resolveFacetConditions(
    visibleIds.map((row) => row.id),
    null,
  );
  if (conditions.length === 0) return first;

  const second = await prisma.contentCategory.findMany({
    where: { AND: [{ content: axisFreeWhere }, { content: { AND: conditions } }] },
    select: { categoryId: true },
    distinct: ["categoryId"],
  });
  // 0행이면 1패스로 폴백 — 위 ⚠️ 주석 참조. `[]` 는 「전부 해제」로 오독된다.
  return second.length > 0 ? second : first;
}
