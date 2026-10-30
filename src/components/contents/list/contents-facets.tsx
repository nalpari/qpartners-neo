"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Checkbox,
  INTERNAL_CATEGORY_TEXT_CLASS,
  MultiSelectCombobox,
  SelectBox,
} from "@/components/common";
import { useTargetLabels } from "@/hooks/use-target-labels";
import api from "@/lib/axios";

import type { ProductAxisGroup } from "./contents-facet-utils";
import { isProductAxisGroupActive, resolveVisibleAxes } from "./contents-facet-utils";
import type { CategoryNode, ListView } from "./contents-contents";

/** 카테고리별 형번 초기 표시 건수 — 목업 `MODEL_LIMIT`. 넘치면 「すべて表示」 로 펼친다 */
const MODEL_LIMIT = 10;

/** 게시대상 셀렉트의 「전체」 항목 — 빈 문자열 = 조건 미적용 */
const POST_TARGET_PLACEHOLDER = { value: "", label: "掲示対象" };

/** `GET /api/master/deptList` 항목 */
interface DeptItem {
  deptCd: string;
  deptNm: string;
}

interface ContentsFacetsProps {
  isInternal: boolean;
  categories: CategoryNode[];
  view: ListView;
  /** 체크된 2Depth id. `null` = 미설정(전부 체크로 표시) / `[]` = 전부 해제 */
  selectedCategoryIds: number[] | null;
  /** 체크된 형번 id. `null` = 미설정(전부 체크로 표시) / `[]` = 전부 해제 */
  selectedProductModelIds: number[] | null;
  productAxis: ProductAxisGroup[];
  /** 제품일람 대상 카테고리가 1건 이상인지 (`/api/products/axis` meta.enabled) */
  isProductAxisEnabled: boolean;
  /** 게시대상 권한코드 — `__NON_MEMBER__` sentinel = 비회원. 빈 문자열 = 전체 */
  roleCode: string;
  /** 담당부문(복수). 빈 배열 = 전체 */
  departments: string[];
  /** 사내전용 자료만 조회 */
  internalOnly: boolean;
  onCategoryIdsChange: (ids: number[] | null) => void;
  onProductModelIdsChange: (ids: number[] | null) => void;
  onRoleCodeChange: (roleCode: string) => void;
  onDepartmentsChange: (departments: string[]) => void;
  onInternalOnlyChange: (internalOnly: boolean) => void;
}

/**
 * 콘텐츠 목록 좌측 분류축 사이드바 — 검색 고도화 REQ-002/003/004.
 *
 * 축은 **DB 1Depth 카테고리에서 동적으로 생성**한다. 축 코드를 화면에 박지 않는다 —
 * 종전 `PRIORITY_CATEGORY_ORDER` 가 폐지된 `業務分類`·`内容分類` 코드를 들고 있던 것이
 * 그 방식의 실패 사례다. 축의 구성·순서·표시 여부는 전부 카테고리관리에서 정해진다.
 *
 * 결합 규칙은 **축 안에서는 OR, 축 사이는 AND** 이며 서버가 판정한다
 * (`lib/content-visibility.ts#resolveFacetConditions`). 축의 상태별 취급은 계획서 §27.3
 * (2026-10-23 사용자 확정)을 따른다.
 *
 * - **전부 체크·일부 체크** → 그 축이 AND 조건 대상이 된다
 * - **전부 해제** → 그 축만 AND 조건에서 **빠진다**. 조회 자체에서 빠지는 것이 아니므로
 *   결과는 **0건이 되지 않고 오히려 넓어진다**
 *
 * 초기 상태(`facetCategoryIds: null` = 미설정)는 화면에 전부 체크로 보이고 서버에도 전부
 * 체크와 같은 조건이 나간다 — 조립은 `contents-contents.tsx` 의 `facetParams` 가 한다.
 *
 * **축별 건수는 표시하지 않는다.** 목업도 같은 결론(B안)이며 사유도 같다 — 축 수만큼
 * COUNT 쿼리가 늘어 검색 본체보다 무거워진다. 총 건수만 목록 상단에 낸다.
 *
 * 최하단에는 **관리자 전용 필터 3개**(掲示対象 셀렉트 · 社内会員の掲示のみ表示 체크 · 担当部門)를
 * 둔다 — 목업 v0.94 의 `#docExtraGroup` 위치다. 사내 직원(슈퍼관리자·관리자)에게만, 그리고
 * **`資料から探す` 모드에서만** 보인다 — 제품일람은 형번의 행이라 게시대상·담당부문으로 거르는
 * 것이 의미를 갖지 않는다(목업 `01-search.html:1566` `internalOn = state.view === "doc"`).
 * 사내 판정은 다른 사내 표시와 같은 `isInternal` 이다. 계획서 §5 에서 「UI 만 제거하고 서버
 * 파라미터·필터 로직은 복구 가능하게 남긴다」 고 했던 것을 화면만 다시 붙인 것이다.
 */
export function ContentsFacets({
  isInternal,
  categories,
  view,
  selectedCategoryIds,
  selectedProductModelIds,
  productAxis,
  isProductAxisEnabled,
  roleCode,
  departments,
  internalOnly,
  onCategoryIdsChange,
  onProductModelIdsChange,
  onRoleCodeChange,
  onDepartmentsChange,
  onInternalOnlyChange,
}: ContentsFacetsProps) {
  /** 접힌 형번 카테고리 — 기본은 접힘(목업 `.mf-body[hidden]`) */
  const [expandedModelCats, setExpandedModelCats] = useState<Record<number, true>>({});
  /** 「すべて表示」 로 10건 제한을 푼 카테고리 */
  const [shownAllModelCats, setShownAllModelCats] = useState<Record<number, true>>({});

  // 게시대상 옵션 — 권한관리의 `isActive=Y` 만. 라벨은 권한명을 쓴다.
  // 비회원(roleCode=null) 은 SelectBox value 로 null 을 다룰 수 없어 sentinel `__NON_MEMBER__` 를
  // 쓰고, 서버 `listContentsQuerySchema` 가 transform 으로 null 로 되돌린다.
  // contentTargetOptions 는 SUPER_ADMIN/ADMIN 를 제외한다 — 사내회원은 게시대상과 무관하게
  // 항상 조회 가능하므로 조건으로서 의미가 없다.
  const { contentTargetOptions } = useTargetLabels();
  const postTargetOptions = useMemo(
    () => [
      POST_TARGET_PLACEHOLDER,
      ...contentTargetOptions
        .filter((o) => o.isActive)
        .map((o) => ({ value: o.roleCode ?? "__NON_MEMBER__", label: o.label })),
    ],
    [contentTargetOptions],
  );

  // 담당부문 옵션 — 사내 사용자에게만 요청한다(enabled 가드). `/codes/lookup` 과 같은 패턴.
  const {
    data: deptItems = [],
    isPending: isDeptLoading,
    isError: isDeptLoadError,
  } = useQuery({
    queryKey: ["master", "deptList"],
    queryFn: async () => {
      const res = await api.get<{ data: DeptItem[] }>("/master/deptList");
      const items = res.data?.data;
      if (!Array.isArray(items)) {
        throw new Error("Unexpected response shape from /master/deptList");
      }
      return items;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInternal,
  });

  // 서버는 `Content.authorDepartment`(작성 시 `user.deptNm` 일본어 부서명)와 동등 비교한다 —
  // 그래서 option value 는 deptCd 가 아니라 **deptNm** 이어야 매칭된다.
  const departmentOptions = useMemo(
    () => deptItems.map((d) => ({ value: d.deptNm, label: d.deptNm })),
    [deptItems],
  );

  // 부서가 0건인 정상 응답 — placeholder 만 남은 셀렉트를 띄우는 대신 "-" 로 표시한다.
  const isDeptEmpty =
    isInternal && !isDeptLoading && !isDeptLoadError && deptItems.length === 0;

  // 표시 축 — 테이블의 분류 컬럼과 **같은 기준**을 쓴다(`isVisible` = 一覧表示).
  // 사내전용 1Depth 는 비사내 사용자에게 축 자체를 내보내지 않는다 — 축 제목이 부모
  // 카테고리명이라, 선택지가 비어도 사내 분류명이 그대로 드러난다.
  const visibleAxes = useMemo(
    () => resolveVisibleAxes(categories, isInternal),
    [categories, isInternal],
  );

  /** 축별 선택 가능한 2Depth id (사내전용 자식은 비사내에서 제외) */
  const axisChildIds = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const axis of visibleAxes) {
      map.set(
        axis.id,
        axis.children
          .filter((child) => isInternal || !child.isInternalOnly)
          .map((child) => child.id),
      );
    }
    return map;
  }, [visibleAxes, isInternal]);

  const allCategoryIds = useMemo(
    () => [...axisChildIds.values()].flat(),
    [axisChildIds],
  );

  /**
   * 선택 가능한 형번 id.
   * - 사용중지 카테고리의 형번은 제외(목업 `mf-use-off`)
   * - **공개 자료가 0건인 형번도 제외** (2026-10-13). 체크해도 결과가 달라지지 않는
   *   무효 체크박스를 켜 두지 않는다. 판정은 서버(`/api/products/axis#hasDocuments`)가 한다.
   */
  const allProductModelIds = useMemo(
    () =>
      productAxis
        .filter(isProductAxisGroupActive)
        .flatMap((group) => group.productModels.filter((m) => m.hasDocuments).map((m) => m.id)),
    [productAxis],
  );

  // `null`(미설정) 은 **전부 체크**로 보인다 — 초기 화면이 전부 체크여야 한다는 2026-10-23
  // 사용자 결정. 조건으로는 「거르지 않음」이라 전체 건수가 그대로 나온다.
  // `[]`(사용자가 전부 해제) 는 표시도 전부 해제다.
  const effectiveCategoryIds = selectedCategoryIds ?? allCategoryIds;
  const effectiveModelIds = selectedProductModelIds ?? allProductModelIds;
  const categorySet = useMemo(() => new Set(effectiveCategoryIds), [effectiveCategoryIds]);
  const modelSet = useMemo(() => new Set(effectiveModelIds), [effectiveModelIds]);

  // 전부 체크로 되돌아오면 미설정(`null`)으로 정규화한다 — 그래야 초기 화면과 같은 조건
  // (분류가 없는 자료까지 포함한 전체)으로 돌아간다. 전체 id 를 그대로 조건으로 보내면
  // 분류가 하나도 없는 자료가 빠져 초기 건수와 어긋난다.
  //
  // ⚠️ `all*.length > 0` 가드가 필요하다. 축 데이터가 아직 안 왔거나(`/api/categories` 미완료)
  // 조건을 만족하는 형번이 0건이면 `all*.length === 0` 이고, 그때 「전부 해제」를 누르면
  // `next.length === 0 === all.length` 가 성립해 `null`(= 화면 전부 체크)로 뒤집힌다 —
  // 누른 버튼과 정반대 결과가 된다.
  const commitCategories = (next: number[]) =>
    onCategoryIdsChange(
      allCategoryIds.length > 0 && next.length === allCategoryIds.length ? null : next,
    );
  const commitModels = (next: number[]) =>
    onProductModelIdsChange(
      allProductModelIds.length > 0 && next.length === allProductModelIds.length
        ? null
        : next,
    );

  const toggleCategory = (id: number, checked: boolean) => {
    commitCategories(
      checked
        ? [...effectiveCategoryIds, id]
        : effectiveCategoryIds.filter((v) => v !== id),
    );
  };

  const setAxisAll = (axisId: number, checked: boolean) => {
    const ids = axisChildIds.get(axisId) ?? [];
    const idSet = new Set(ids);
    const rest = effectiveCategoryIds.filter((v) => !idSet.has(v));
    commitCategories(checked ? [...rest, ...ids] : rest);
  };

  const toggleModel = (id: number, checked: boolean) => {
    commitModels(
      checked ? [...effectiveModelIds, id] : effectiveModelIds.filter((v) => v !== id),
    );
  };

  /** 형번 카테고리 헤더 체크 — 하위 형번 일괄 토글 (목업 `.f-modelcat`) */
  const setModelCatAll = (group: ProductAxisGroup, checked: boolean) => {
    // 자료 0건 형번은 선택 대상이 아니다 — 카테고리 전체선택에도 끼우지 않는다.
    const ids = group.productModels.filter((m) => m.hasDocuments).map((m) => m.id);
    const idSet = new Set(ids);
    const rest = effectiveModelIds.filter((v) => !idSet.has(v));
    commitModels(checked ? [...rest, ...ids] : rest);
  };

  const setModelAxisAll = (checked: boolean) => {
    commitModels(checked ? allProductModelIds : []);
  };

  /** 사이드바 전체 선택/해제 — 분류축과 형번축을 함께 움직인다 */
  const setAll = (checked: boolean) => {
    commitCategories(checked ? allCategoryIds : []);
    commitModels(checked ? allProductModelIds : []);
  };

  // 型番 축은 제품일람 탭에서만 적용된다(목업 `toggleModelGroup`). 제품일람 대상
  // 카테고리가 0건이면 제목만 남아 미완성으로 보이므로 그룹째 감춘다.
  const showModelAxis = view === "prod" && isProductAxisEnabled && productAxis.length > 0;

  return (
    <aside className="flex w-full flex-col gap-[14px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] px-[18px] py-[22px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#45576f]">
          カテゴリ
        </span>
        <span className="flex gap-[4px] shrink-0">
          <FacetActionButton onClick={() => setAll(true)}>すべて選択</FacetActionButton>
          <FacetActionButton onClick={() => setAll(false)}>すべて解除</FacetActionButton>
        </span>
      </div>

      {showModelAxis && (
        <>
          <section className="flex flex-col gap-[4px]">
            <FacetHead
              title="型番（製品一覧）"
              onAll={() => setModelAxisAll(true)}
              onNone={() => setModelAxisAll(false)}
            />
            <div className="flex flex-col gap-[2px]">
              {productAxis.map((group) => {
                const ids = group.productModels.filter((m) => m.hasDocuments).map((m) => m.id);
                const selectable = isProductAxisGroupActive(group) && ids.length > 0;
                const checkedCount = ids.filter((id) => modelSet.has(id)).length;
                const isExpanded = expandedModelCats[group.id] === true;
                const showAll = shownAllModelCats[group.id] === true;
                const visibleModels = showAll
                  ? group.productModels
                  : group.productModels.slice(0, MODEL_LIMIT);

                return (
                  <div key={group.id} className={selectable ? "" : "opacity-45"}>
                    <div className="flex items-center gap-[6px] py-[3px]">
                      <Checkbox
                        checked={selectable && checkedCount === ids.length}
                        indeterminate={checkedCount > 0 && checkedCount < ids.length}
                        onChange={(checked) => setModelCatAll(group, checked)}
                        disabled={!selectable}
                      />
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center gap-[4px] text-left"
                        onClick={() =>
                          setExpandedModelCats((prev) => {
                            const next = { ...prev };
                            if (next[group.id]) delete next[group.id];
                            else next[group.id] = true;
                            return next;
                          })
                        }
                        disabled={group.productModels.length === 0}
                        aria-expanded={isExpanded}
                      >
                        <span className="text-[10px] text-[#8a95a1] w-[10px] shrink-0">
                          {group.productModels.length > 0 ? (isExpanded ? "▼" : "▶") : ""}
                        </span>
                        <span
                          className="flex-1 min-w-0 font-['Noto_Sans_JP'] text-[13px] text-[#45576f] truncate"
                          title={group.name}
                        >
                          {group.name}
                        </span>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="flex flex-col gap-[2px] pl-[22px]">
                        {visibleModels.map((model) => (
                          <Checkbox
                            key={model.id}
                            // 자료 0건 형번은 체크해도 결과가 바뀌지 않는다 → 해제 + 비활성.
                            checked={model.hasDocuments && modelSet.has(model.id)}
                            onChange={(checked) => toggleModel(model.id, checked)}
                            label={model.modelCode}
                            disabled={!selectable || !model.hasDocuments}
                            className={`[&>span:last-child]:font-mono [&>span:last-child]:text-[12px] ${
                              model.hasDocuments ? "" : "opacity-45"
                            }`}
                          />
                        ))}
                        {group.productModels.length > MODEL_LIMIT && (
                          <button
                            type="button"
                            className="self-start font-['Noto_Sans_JP'] text-[11px] text-[#1060b4] underline py-[2px]"
                            onClick={() =>
                              setShownAllModelCats((prev) => {
                                const next = { ...prev };
                                if (next[group.id]) delete next[group.id];
                                else next[group.id] = true;
                                return next;
                              })
                            }
                          >
                            {showAll
                              ? `一部のみ表示（${MODEL_LIMIT}件）`
                              : `すべて表示（${group.productModels.length}件）`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <hr className="h-px bg-[#eff4f8] border-0" />
        </>
      )}

      {visibleAxes.map((axis, index) => {
        const childIds = axisChildIds.get(axis.id) ?? [];
        return (
          <div key={axis.id} className="flex flex-col gap-[4px]">
            {index > 0 && <hr className="h-px bg-[#eff4f8] border-0 mb-[10px]" />}
            {/* 축 제목(1Depth)은 사내전용이어도 기본색 — 적색은 2Depth 분류 값 전용
                (2026-10-23 결정). */}
            <FacetHead
              title={axis.name}
              onAll={() => setAxisAll(axis.id, true)}
              onNone={() => setAxisAll(axis.id, false)}
            />
            <div className="flex flex-col gap-[2px]">
              {childIds.length === 0 && (
                <span className="font-['Noto_Sans_JP'] text-[12px] text-[#999]">-</span>
              )}
              {axis.children.map((child) => {
                if (child.isInternalOnly && !isInternal) return null;
                return (
                  <Checkbox
                    key={child.id}
                    checked={categorySet.has(child.id)}
                    onChange={(checked) => toggleCategory(child.id, checked)}
                    label={child.name}
                    className={
                      child.isInternalOnly ? "[&>span:last-child]:!text-[#ff1a1a]" : ""
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 「カテゴリをリセット」 버튼 삭제 (2026-10-13 사용자 지시, 2026-10-23 근거 갱신).
          초기 상태는 `facetCategoryIds: null` = 미설정이고 화면에는 **전부 체크**로 보인다.
          그 기준에서 「리셋」은 전부 체크이고, 그 동작은 이미 상단 `すべて選択` 가 한다 —
          같은 일을 하는 버튼이 둘이 되므로 뺀다. */}

      {/* 관리자 전용 필터 — 좌측영역 최하단 3개 묶음 (목업 v0.94 `#docExtraGroup`).
          라벨을 적색으로 두는 것은 사내 전용 항목 표식이다(사내전용 카테고리와 같은 색). */}
      {isInternal && view === "doc" && (
        <>
          <section className="flex flex-col gap-3 border-t border-[#eff4f8] pt-[18px]">
            <p
              className={`font-['Noto_Sans_JP'] font-bold text-[13px] truncate ${INTERNAL_CATEGORY_TEXT_CLASS}`}
            >
              掲示対象
            </p>
            <div className="flex flex-col gap-[14px]">
              {/* 사내전용만 조회 시에는 게시대상을 조건으로 쓰지 않는다 — 서버도 internalOnly
                  분기에서 roleCode 를 무시하므로, 켜져 있는 입력이 결과에 영향을 주지 않는
                  상태를 만들지 않기 위해 비활성화한다 (목업 v0.94 요구 ⑤). */}
              <SelectBox
                options={postTargetOptions}
                value={roleCode}
                onChange={onRoleCodeChange}
                disabled={internalOnly}
              />
              <Checkbox
                checked={internalOnly}
                onChange={onInternalOnlyChange}
                label="社内会員の掲示のみ表示"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t border-[#eff4f8] pt-[18px]">
            <p
              className={`font-['Noto_Sans_JP'] font-bold text-[13px] truncate ${INTERNAL_CATEGORY_TEXT_CLASS}`}
            >
              担当部門
            </p>
            {isDeptEmpty ? (
              <span className="font-['Noto_Sans_JP'] text-[13px] text-[#999]">-</span>
            ) : (
              <MultiSelectCombobox
                options={departmentOptions}
                values={departments}
                onChange={onDepartmentsChange}
                placeholder="担当部門"
                disabled={isDeptLoading || isDeptLoadError}
              />
            )}
            {isDeptLoadError && (
              <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#ff1a1a]">
                担当部門の読み込みに失敗しました。
              </p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

/**
 * 探し方 전환 — 목업 v0.94 `.mode-block`(`01-search.html:522`).
 *
 * 필터 영역 **안**, 분류 카드 위의 독립 카드다. 종전에는 목록 상단에 `資料一覧`/`製品一覧`
 * 토글로 두었는데, 그 배치는 목업이 쓰다 버린 `.viewtoggle`(CSS 만 잔존) 이었다.
 * 업무리뷰(2026.10.20)에서 「探し方はフィルタ領域に置き、製品から探すを既定とする」로 확정됐다.
 *
 * `compact` 는 모바일 상단 바용이다 — 목업 모바일(`assets/qp-mobile.js:152`)은 같은 전환을
 * 필터 시트 **밖**, `フィルタ` 버튼 옆에 두고 라벨을 `資料一覧`/`製品一覧` 로 줄인다.
 * 좁은 화면에서 전환이 패널 안에 숨으면 모드가 있는 줄도 모르게 되므로 바깥에 남긴다.
 */
export function ContentsModeSwitch({
  view,
  onViewChange,
  compact = false,
}: {
  view: ListView;
  onViewChange: (view: ListView) => void;
  compact?: boolean;
}) {
  const tabs = (
    <div
      role="tablist"
      aria-label="探し方"
      className={`grid grid-cols-2 gap-[4px] rounded-[8px] border border-[#e6eef6] bg-[#f7f9fb] p-[4px] ${
        compact ? "min-w-0 flex-1" : ""
      }`}
    >
      <ModeButton active={view === "doc"} onClick={() => onViewChange("doc")}>
        {compact ? "資料一覧" : "資料から探す"}
      </ModeButton>
      <ModeButton active={view === "prod"} onClick={() => onViewChange("prod")}>
        {compact ? "製品一覧" : "製品から探す"}
      </ModeButton>
    </div>
  );

  if (compact) return tabs;

  return (
    <section className="flex flex-col gap-[10px] rounded-[12px] bg-white px-[18px] py-[16px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
      <h2 className="font-['Noto_Sans_JP'] text-[14px] font-semibold text-[#45576f]">探し方</h2>
      {tabs}
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-[40px] rounded-[6px] font-['Noto_Sans_JP'] text-[13px] transition-colors duration-150 ${
        active
          ? "bg-[#246097] font-bold text-white"
          : "bg-transparent text-[#6a88a9] hover:text-[#2e5884]"
      }`}
    >
      {children}
    </button>
  );
}

function FacetHead({
  title,
  titleClassName,
  onAll,
  onNone,
}: {
  title: string;
  titleClassName?: string;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2
        className={`font-['Noto_Sans_JP'] font-bold text-[13px] text-[#45576f] truncate ${titleClassName ?? ""}`}
        title={title}
      >
        {title}
      </h2>
      <span className="flex gap-[4px] shrink-0">
        <FacetActionButton onClick={onAll}>全選択</FacetActionButton>
        <FacetActionButton onClick={onNone}>全解除</FacetActionButton>
      </span>
    </div>
  );
}

function FacetActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[3px] border border-[#e6eef6] bg-[#f7f9fb] px-[6px] py-[2px] font-['Noto_Sans_JP'] text-[11px] text-[#6a88a9] transition-colors hover:border-[#246097] hover:text-[#246097]"
    >
      {children}
    </button>
  );
}
