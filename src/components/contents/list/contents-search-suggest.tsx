"use client";

import Link from "next/link";

import { CategoryName, type CategoryLabelSource } from "@/components/common";

import type { CategoryNode } from "./contents-contents";
import { resolveVisibleAxes } from "./contents-facet-utils";
import { DOC_TYPE_AXIS_CODE } from "@/lib/schemas/common";

/** `GET /api/search/suggest` 응답의 제품 후보 1건 */
export interface SuggestProductItem {
  id: number;
  modelCode: string;
  category: { name: string; isInternalOnly: boolean } | null;
}

/** `GET /api/search/suggest` 응답의 자료 후보 1건 */
export interface SuggestContentItem {
  id: number;
  title: string;
  /** 1Depth 축 노드 배열. `children` 은 서버가 sortOrder ASC → id ASC 로 안정 정렬해 내려준다 */
  categories: {
    categoryCode: string;
    children: { name: string; isInternalOnly: boolean }[];
  }[];
}

export interface SuggestData {
  products: SuggestProductItem[];
  contents: SuggestContentItem[];
}

interface ContentsSearchSuggestProps {
  data: SuggestData | undefined;
  /** 하이라이트 기준 문자열 — 서버가 실제로 매칭에 쓴 값(디바운스 확정분) */
  query: string;
  categories: CategoryNode[];
  isInternal: boolean;
  /** 키보드로 고른 후보의 인덱스. -1 = 미선택 */
  activeIndex: number;
  /** 후보 클릭 시 — 드롭다운을 닫는다. 이동 자체는 Link 가 처리한다 */
  onSelect: () => void;
}

/** 후보 1건의 이동 대상 — 키보드 Enter 가 쓰는 최소 정보 */
export interface SuggestNavItem {
  kind: "prod" | "doc";
  href: string;
}

/**
 * 화면에 그려지는 **순서 그대로**의 이동 대상 목록 — `[製品]` → `[資料]`.
 *
 * 드롭다운(표시)과 검색바(키보드 Enter)가 같은 순서를 봐야 "3번째를 골랐는데 다른 데로 간다"가
 * 생기지 않는다. 그래서 순서 규칙은 이 함수 하나만 갖고, 양쪽이 공유한다.
 */
export function toSuggestNavItems(data: SuggestData | undefined): SuggestNavItem[] {
  return [
    ...(data?.products ?? []).map((p) => ({ kind: "prod" as const, href: `/products/${p.id}` })),
    ...(data?.contents ?? []).map((c) => ({ kind: "doc" as const, href: `/contents/${c.id}` })),
  ];
}

/**
 * 자료 후보의 부제 — **표시 축 순서대로 처음 값이 있는 분류명**.
 *
 * 목업은 `d.docType`(資料種別) 하나를 쓰지만, neo 는 어느 1Depth 가 `資料種別` 인지를
 * 코드에 둘 수 없다 — 축의 구성·순서·표시 여부는 전부 카테고리관리에서 정해진다
 * (`contents-table.tsx` 의 분류 컬럼이 `PRIORITY_CATEGORY_ORDER` 를 걷어낸 것과 같은 이유).
 * 그래서 축 코드를 고르지 않고 **표시 축 중 첫 값**을 쓴다.
 *
 * 축 선정은 사이드바·테이블과 같은 `resolveVisibleAxes` 이고, 축 안에서 고르는 자식도
 * 테이블의 `getFirstCategoryChildName` 과 같은 `children[0]` 이다 — 같은 자료가 목록과
 * 자동완성에서 다른 분류로 보이지 않게 맞춘다.
 */
/**
 * 자료 후보의 부제 — **자료종별 고정**(REQ-001 「[자료] 제목 + 자료종류」).
 *
 * 종전에는 「값이 있는 첫 축」을 썼는데, 그러면 자료마다 情報種別·製品分類·資料種別 이
 * 섞여 나와 부제가 무엇을 뜻하는지 알 수 없었다. 목업도 `d.docType` 한 축만 쓴다.
 *
 * 그 자료에 자료종별 분류가 없으면 `null` — 부제를 비운다. 다른 축으로 대체하지 않는다.
 * 표시 중이 아닌 축(`一覧表示` N)이면 후보에도 내지 않는다.
 */
function resolveContentSubLabel(
  item: SuggestContentItem,
  axes: CategoryNode[],
): CategoryLabelSource | null {
  const visible = axes.some((axis) => axis.categoryCode === DOC_TYPE_AXIS_CODE);
  if (!visible) return null;
  const matched = item.categories.find((c) => c.categoryCode === DOC_TYPE_AXIS_CODE);
  return matched?.children[0] ?? null;
}

/**
 * 검색어와 일치하는 구간을 `<mark>` 로 감싼다.
 *
 * 대소문자만 무시하는 **단순 부분일치**다. 서버 매칭(`contains` + `utf8mb4_unicode_ci`)과
 * 같은 기준이어야 "후보에는 떴는데 어디가 걸린 건지 안 보이는" 상태가 생기지 않는다.
 * 목업 `highlight()` 는 동의어(`SYNONYMS`)까지 칠하지만, neo 는 동의어 보정 자체가
 * 미구현이라(계획서 §13 미구현 발견 1) 칠할 대상이 없다.
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;

  const haystack = text.toLowerCase();
  const parts: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit < 0) {
      if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (hit > cursor) parts.push({ text: text.slice(cursor, hit), matched: false });
    parts.push({ text: text.slice(hit, hit + needle.length), matched: true });
    cursor = hit + needle.length;
  }

  return (
    <>
      {parts.map((part, i) =>
        part.matched ? (
          // 목업 토큰 `--mark-bg`/`--mark-text`. neo 에 검색어 하이라이트 선례가 없어
          // (리치에디터의 형광펜 mark 는 사용자 입력 색이라 기준이 되지 못한다) 목업 값을 쓴다.
          <mark
            key={i}
            className="rounded-[2px] bg-[#FFF1DC] px-[2px] text-[#B05713]"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** `aria-activedescendant` 로 가리킬 후보의 DOM id — 검색바가 같은 규칙으로 만든다. */
export function suggestOptionId(index: number): string {
  return `contents-suggest-option-${index}`;
}

const KIND_BADGE_CLASS = {
  prod: "bg-[#F7F9FB] border-[#EAF0F6] text-[#1060B4]",
  doc: "bg-[#F2F5F8] border-[#E4EAF0] text-[#767676]",
} as const;

function SuggestRow({
  kind,
  href,
  label,
  mono,
  sub,
  query,
  active,
  id,
  onSelect,
}: {
  kind: "prod" | "doc";
  href: string;
  label: string;
  mono: boolean;
  /** 분류명 — 사내전용이면 적색(전 화면 공통 표기) */
  sub: CategoryLabelSource | null;
  query: string;
  active: boolean;
  id: string;
  onSelect: () => void;
}) {
  return (
    <Link
      id={id}
      href={href}
      transitionTypes={["fade"]}
      onClick={onSelect}
      // listbox 의 자식은 option 이어야 한다(ARIA). 앵커로 두면 보조기술이 목록 항목으로
      // 읽지 않는다 — 링크로서의 포커스·클릭 동작은 role 을 얹어도 그대로다.
      role="option"
      aria-selected={active}
      // 키보드 선택은 **포커스를 옮기지 않는다** — 입력창에 커서를 둔 채 골라야 계속 타이핑할 수
      // 있기 때문이다(aria-activedescendant 패턴). 그래서 :focus 가 아니라 클래스로 표시한다.
      className={`flex items-center justify-between gap-3 border-b border-[#EAF0F6] px-[18px] py-[10px] transition-colors last:border-b-0 hover:bg-[#F7F9FB] ${
        active ? "bg-[#EEF4FA]" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-[7px]">
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-[7px] py-[1px] font-['Noto_Sans_JP'] text-[10.5px] font-bold tracking-[0.02em] ${KIND_BADGE_CLASS[kind]}`}
        >
          {kind === "prod" ? "製品" : "資料"}
        </span>
        <span
          className={`truncate text-[14px] leading-[1.5] text-[#101010] ${
            mono ? "font-mono font-bold" : "font-['Noto_Sans_JP']"
          }`}
        >
          <HighlightedText text={label} query={query} />
        </span>
      </span>
      {sub && (
        <CategoryName
          category={sub}
          className="shrink-0 font-['Noto_Sans_JP'] text-[12px] leading-[1.5] whitespace-nowrap text-[#6a88a9]"
        />
      )}
    </Link>
  );
}

/**
 * 통합검색 자동완성 드롭다운 — REQ-001 / 목업 `01-search.html:530` · `updateSuggest()`.
 *
 * 서버(`GET /api/search/suggest`)가 3자 게이트·노출범위·종류별 건수(기본 4)를 모두 판정해
 * 내려주므로, 이 컴포넌트는 **받은 것을 그대로 그린다**. 화면에서 다시 거르면 목록·제품일람과
 * 기준이 갈라진다.
 *
 * 표시 순서는 목업과 같이 `[製品]` → `[資料]` 다. 제품은 제품상세로, 자료는 자료상세로 간다
 * (목업 `openProduct()` / `openDoc()`).
 *
 * 후보가 0건이면 **드롭다운 자체를 띄우지 않는다**(목업 `if (!items.length) … return`) —
 * 그래서 "該当なし" 류의 빈 상태 문구가 없다.
 */
export function ContentsSearchSuggest({
  data,
  query,
  categories,
  isInternal,
  activeIndex,
  onSelect,
}: ContentsSearchSuggestProps) {
  const products = data?.products ?? [];
  const contents = data?.contents ?? [];
  if (products.length === 0 && contents.length === 0) return null;

  const axes = resolveVisibleAxes(categories, isInternal);

  return (
    <div
      id="contents-suggest-listbox"
      role="listbox"
      aria-label="検索候補"
      className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-[8px] border border-[#EAF0F6] bg-white shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.12)]"
    >
      {products.map((product, i) => (
        <SuggestRow
          key={`prod-${product.id}`}
          id={suggestOptionId(i)}
          kind="prod"
          href={`/products/${product.id}`}
          label={product.modelCode}
          mono
          sub={product.category ?? null}
          query={query}
          active={activeIndex === i}
          onSelect={onSelect}
        />
      ))}
      {contents.map((content, i) => (
        <SuggestRow
          key={`doc-${content.id}`}
          id={suggestOptionId(products.length + i)}
          kind="doc"
          href={`/contents/${content.id}`}
          label={content.title}
          mono={false}
          sub={resolveContentSubLabel(content, axes)}
          query={query}
          active={activeIndex === products.length + i}
          onSelect={onSelect}
        />
      ))}
      <p className="bg-[#F7F9FB] px-[18px] py-2 font-['Noto_Sans_JP'] text-[11px] leading-[1.5] text-[#6a88a9]">
        3文字以上で候補を表示します。Enter キーで全件を検索
      </p>
    </div>
  );
}
