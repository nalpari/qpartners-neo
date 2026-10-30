/**
 * 콘텐츠 등록·수정의 **축별 필수 분류** 검증 — 2026-10-14 사용자 결정.
 *
 * 종전 검증은 「전체에서 1개 이상」이라 `製品分類` 만 고르고 저장하면
 * `情報種別`·`製品ステータス` 가 빈 채로 등록됐다. 그렇게 쌓인 자료는 좌측영역에서
 * 그 축을 쓰는 순간 결과에서 사라진다(계획서 §24). 입구에서 막는다.
 *
 * **축 코드를 상수로 둔다.** 축 구성·순서·표시 여부를 코드에 박지 않는다는 원칙
 * (`PRIORITY_CATEGORY_ORDER` 폐기)과 충돌하는 듯 보이지만, 그 원칙이 막으려던 실패는
 * 「폐지된 축을 상수가 참조한 채 **조용히** 어긋나는 것」이었다. 여기서는
 * **현재 표시 중인 축에만 적용**하므로 축이 폐지되면 요구가 자동으로 빠진다.
 *
 * TO-BE 개명(`製品分類` → `製品カテゴリ`, `資料分類` → `資料種別`)은 표시명만 바뀌고
 * `categoryCode` 는 유지되므로 이 상수는 영향을 받지 않는다.
 */

import { prisma } from "@/lib/prisma";
import { REQUIRED_AXIS_CODES } from "@/lib/schemas/common";

export interface MissingAxis {
  categoryCode: string;
  name: string;
}

/**
 * 선택된 2Depth id 로부터 **비어 있는 필수 축**을 찾는다.
 *
 * @param categoryIds 선택된 2Depth 카테고리 id
 * @returns 비어 있는 필수 축 목록. 전부 채워졌으면 빈 배열
 */
export async function findMissingRequiredAxes(
  categoryIds: number[] | undefined,
): Promise<MissingAxis[]> {
  // 표시 중인 필수 축만 대상 — 폐지(`isVisible=false`)·사용중지(`isActive=false`) 축은 요구하지 않는다.
  const axes = await prisma.category.findMany({
    where: {
      parentId: null,
      isActive: true,
      isVisible: true,
      categoryCode: { in: [...REQUIRED_AXIS_CODES] },
    },
    select: { id: true, categoryCode: true, name: true },
  });
  if (axes.length === 0) return [];

  const selected = [...new Set(categoryIds ?? [])];
  if (selected.length === 0) {
    return axes.map((a) => ({ categoryCode: a.categoryCode, name: a.name }));
  }

  const rows = await prisma.category.findMany({
    where: { id: { in: selected } },
    select: { parentId: true },
  });
  const coveredAxisIds = new Set(rows.map((r) => r.parentId).filter((v): v is number => v !== null));

  return axes
    .filter((a) => !coveredAxisIds.has(a.id))
    .map((a) => ({ categoryCode: a.categoryCode, name: a.name }));
}

/** 사용자 대면 안내 문구 — 일본어. 비어 있는 축 이름을 그대로 넣는다. */
export function missingAxesMessage(missing: MissingAxis[]): string {
  return `${missing.map((m) => `「${m.name}」`).join("・")}を1つ以上選択してください。`;
}
