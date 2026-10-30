# 검색기능 고도화 Design Document

> **Summary**: 자료를 **제품 형번(型番)** 축으로 찾는 계통 신설 + 콘텐츠 목록 검색 전면 개편 — 데이터 모델, API, 노출 판정, 화면 설계
>
> **Project**: qpartners-neo
> **Version**: 1.0
> **Author**: CK
> **Date**: 2026-10-23
> **Status**: Draft
> **Planning Doc**: [search-enhancement.plan.md](../../01-plan/features/search-enhancement.plan.md) · [search-enhancement.mapping.md](../../01-plan/features/search-enhancement.mapping.md)
> **근거 산출물**: `IP-AN-RD_요구사항정의서_(Q.Partners 검색기능 고도화)_v1.0_261021` (REQ-001~013) / 목업 v0.94 (고객 공유본 v1.1)

---

## 1. Overview

### 1.1 Design Goals

1. **형번으로 자료를 찾는다** — 자료는 제품 모델번호에 연결되고, 제품 단위로도 집계해 볼 수 있다 (REQ-007~010)
2. **검색 조건을 상설 노출한다** — 종전 `詳細条件` 팝업 패널을 좌측 상설 사이드바로 바꾼다 (REQ-002)
3. **축 구성을 데이터로 정한다** — 축 코드를 화면에 하드코딩하지 않는다. 카테고리관리가 정본이다 (REQ-003)
4. **사내전용 자료·분류를 한눈에 구분한다** — 행 배경색 + 분류명 적색 (REQ-011~012)

### 1.2 Design Principles

| # | 원칙 | 이유 |
|---|---|---|
| 1 | **노출 판정은 서버가 끝낸다** | 클라이언트 판정은 UI 힌트일 뿐. 비공개 자료·형번의 존재가 새어 나가면 안 된다 |
| 2 | **축 코드를 코드에 박지 않는다** | 폐지된 `業務分類`·`内容分類` 코드를 상수로 들고 있다가 깨진 선례가 있다 (`PRIORITY_CATEGORY_ORDER`) |
| 3 | **사이드바와 테이블이 같은 축 집합을 쓴다** | 갈라지면 「사이드바엔 있는데 컬럼엔 없는 분류」가 생긴다 → `resolveVisibleAxes()` 공유 |
| 4 | **형번은 2Depth 카테고리에만 붙는다** | 1Depth 는 축이지 분류가 아니다. 서버가 `assertProductCategory` 로 강제 |
| 5 | **삭제는 연결만 끊는다** | 형번을 지워도 자료는 남는다. 연결이 남으면 유령 형번이 화면에 뜬다 |

### 1.3 Scope

**신규**: 형번 마스터·자료연결 테이블, 형번관리 화면, 제품상세 화면, API 7개, 자동완성, 실시간 검색
**변경**: 콘텐츠 목록(좌측영역·제품일람 탭·컬럼), 콘텐츠 등록/수정(형번 섹션), 자료상세(형번 칩), 카테고리관리(제품일람 표시·사내전용 규칙)
**대상 외**: 외부 I/F(QSP·SEKO) — 형번 계통은 전부 내부 API

---

## 2. Architecture

### 2.1 Component Diagram

```
[ 콘텐츠 목록 /contents ]
  ContentsContents (상태·조회 오케스트레이션)
   ├─ ContentsModeSwitch   探し方 — 資料から探す / 製品から探す
   ├─ ContentsSearch       키워드 + AND/OR + 자동완성(ContentsSearchSuggest)
   ├─ ContentsFacets       좌측 분류축 · 型番 축 · 관리자 전용 필터 3개
   └─ ContentsTable        資料一覧 그리드 / 製品一覧 그리드 (ag-grid)

[ 형번관리 /admin/product-models ]      [ 제품상세 /products/[id] ]
  ProductModelsContents                   ProductDetail
   ├─ ProductModelsSearch                  └─ 연결 자료 목록(동적 분류축 컬럼)
   ├─ ProductModelsTable (인라인 편집)
   └─ ProductModelsDetail (6:4 우측)

[ 공용 판정 모듈 — src/lib ]
  product-model.ts          형번 노출 판정 select / visibility filter
  content-search.ts         키워드 검색 조건 조립
  content-visibility.ts     게시대상·기간·분류축 결합(resolveFacetConditions)
  content-required-axes.ts  콘텐츠 등록 시 축별 필수 분류
  content-internal-only.ts  사내전용 자료 판정(서버·화면 공용)
```

### 2.2 Data Flow — 자료일람 조회

```
사용자 체크 변경
  → ContentsFacets onChange
  → ContentsContents.setSearchParams (page=1 리셋)
  → facetParams 조립 (축 단위 정규화 §6.1)
  → GET /api/contents?facetCategoryIds=…&keyword=…&productModelIds=…
  → resolveFacetConditions(): 축별 그룹핑 → 축 안 IN(OR), 축 사이 AND
  → content-visibility: 게시대상·게시기간·사내전용 필터 AND 결합
  → 결과 + meta.total
```

### 2.3 Dependencies

- Prisma 7 (`qp_product_models`, `qp_content_product_models`, `qp_categories.is_product_list`)
- TanStack Query (`["contents"]`, `["products"]`, `["products","axis"]`, `["master","deptList"]`)
- ag-grid (`DataGrid` 래퍼 — `getRowClass` 지원)
- RBAC: `ADM_PRODUCT_MODEL` 메뉴 + 권한행 (마이그레이션으로 투입, seed 미사용)

---

## 3. Data Model

### 3.1 신규 테이블

```prisma
model ProductModel {
  id          Int      @id @default(autoincrement())
  categoryId  Int      @map("category_id")
  modelCode   String   @map("model_code") @db.VarChar(100)
  sortOrder   Int      @default(1) @map("sort_order")
  isVisible   Boolean  @default(true) @map("is_visible")
  // 감사 컬럼 4종 생략
  category    Category              @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  contents    ContentProductModel[]

  @@unique([categoryId, modelCode], map: "qp_product_models_category_model_key")
  @@index([categoryId, sortOrder])
  @@index([isVisible])
  @@map("qp_product_models")
}

model ContentProductModel {
  contentId      Int @map("content_id")
  productModelId Int @map("product_model_id")
  // created_at / created_by
  @@id([contentId, productModelId])
  @@index([productModelId, contentId])   // 제품일람 역방향 집계용
  @@map("qp_content_product_models")
}
```

**변경**: `Category.isProductList Boolean @default(false) @map("is_product_list")`

### 3.2 형번 중복 판정

`(category_id, model_code)` UNIQUE + `utf8mb4_unicode_ci` 콜레이션이 담당한다.

| 입력 | 판정 | 근거 |
|---|---|---|
| `HQJP-A44` vs `hqjp-a44` | **중복** | `_ci` — 대소문자 무시 |
| `HQJP-A44 ` vs `HQJP-A44` | **중복** | PAD SPACE — 끝 공백 무시 |
| ` HQJP-A44` vs `HQJP-A44` | **중복** | 애플리케이션에서 `trim()` 후 저장 |
| `栄信 SRシリーズ` 의 가운데 공백 | **보존** | 제거하면 서로 다른 형번이 중복으로 막힌다 |

### 3.3 Entity Relationships

```
Category 1 ──< ProductModel 1 ──< ContentProductModel >── 1 Content
         └──< ContentCategory >── 1 Content
```

형번 삭제 시 `ContentProductModel` 만 CASCADE — 자료는 남는다.

---

## 4. API Specification

### 4.1 Endpoint List

| # | Method | Path | 용도 | 권한 |
|---|---|---|---|---|
| 1 | GET/POST | `/api/product-models` | 형번 목록·등록 | `ADM_PRODUCT_MODEL` read/create |
| 2 | PUT/DELETE | `/api/product-models/[id]` | 형번 수정·삭제 | 〃 update/delete |
| 3 | GET | `/api/product-models/[id]/cascade-preview` | 삭제 시 영향 자료 수 | 〃 delete |
| 4 | GET | `/api/products` | 제품일람 목록(형번 단위 집계) | 공개 |
| 5 | GET | `/api/products/axis` | 카테고리별 형번 축 | 공개 |
| 6 | GET | `/api/products/[id]` | 제품상세 + 연결 자료 | 공개 |
| 7 | GET | `/api/search/suggest` | 자동완성(제품/자료) | 공개 |

**수정**: `GET /api/contents`(검색 조건 전면 개편) · `GET/PUT /api/contents/[id]`(형번 연결) · `PUT /api/categories/[id]`(플래그 전파)

### 4.2 `GET /api/products` — 제품일람

자료일람과 **같은 검색 결과를 형번 단위로 다시 묶는다**. 조건에 걸린 자료를 紐づく 형번마다 세어 `資料数` 를 만든다.

- 조건에 맞는 자료가 0건인 형번은 **목록에 나오지 않는다**(축에는 남는다 — `/products/axis`)
- 집계 대상 형번: `is_visible=true` + 제품일람 대상 카테고리 + 사용중 카테고리
- 비사내 사용자에게는 **사내전용 카테고리의 형번 제외**
- 비사내 사용자의 `keyword` 요청에 rate limit (IP당 60회/분, IP 불명 시 20회/분)

### 4.3 `GET /api/products/[id]` — 제품상세

노출 불가 형번(비표시 / 제품일람 OFF / 사용중지·사내전용 카테고리)은 **404** 로 답한다.
403 으로 구분하면 그 형번이 존재한다는 사실이 새어 나간다.

### 4.4 `GET /api/search/suggest` — 자동완성

- 3자 이상에서만 실행, 대상은 **자료 제목 + 제품 형번** (본문·첨부파일명 제외 — 성능)
- 정렬: `[제품]` 카테고리 순서 → 형번 순서 / `[자료]` 최신 등록일순
- 후보 클릭은 **검색을 실행하지 않고** 해당 제품상세·자료상세로 직행한다

### 4.5 `PUT /api/categories/[id]` — 플래그 전파

`isInternalOnly` 와 `isProductList` 는 **같은 규칙**이다 (2026-10-23 통일).

| 대상 | 동작 |
|---|---|
| 1Depth 에 전송 | 같은 트랜잭션에서 **하위 2Depth 전체에 양방향(Y·N) 전파** |
| 2Depth 에 전송 | 그 카테고리만 변경 |
| 값이 안 바뀐 저장 | **필드를 보내지 않는다** — 보내면 1Depth 의 다른 필드만 고쳐도 자식 설정이 덮인다 |

화면의 1Depth 표시값은 **자식 전원 Y 여부에서 파생**한다 (`resolveInternalOnlyValue` / `resolveProductListValue`).

---

## 5. 노출 판정

### 5.1 사내전용 **자료** 판정

```ts
// src/lib/content-internal-only.ts
export const INTERNAL_ROLE_CODES: readonly string[] = ["SUPER_ADMIN", "ADMIN"];

export function isInternalOnlyContent(targets: { roleCode: string | null }[]): boolean {
  return !targets.some(
    (t) => t.roleCode === null || !INTERNAL_ROLE_CODES.includes(t.roleCode),
  );
}
```

게시대상에 **외부 대상(비회원 `null` 또는 비-INTERNAL 권한)이 하나도 없으면** 사내전용이다. 게시대상 0건도 사내전용.
서버(Prisma `targets: { none: ... }`)와 화면이 **같은 모듈**을 쓴다 — 두 판정이 갈라지면 색과 결과가 어긋난다.

### 5.2 사내전용 **카테고리** 와는 별개 축이다

`qp_categories.is_internal_only` 는 분류의 속성이고, 5.1 은 자료의 속성이다. 둘은 독립이다.

### 5.3 형번 노출

`productModelVisibilityFilter(isInternal)` — 사내 사용자에게는 사내전용 카테고리의 형번도 보인다.
`PRODUCT_MODEL_CATEGORY_SELECT` 하나가 형번관리·제품일람·제품상세·콘텐츠 형번 섹션·자동완성을 모두 커버한다.

---

## 6. 분류축 결합 규칙 (2026-10-23 확정)

### 6.1 규칙

| 축 상태 | 동작 |
|---|---|
| 축 **안** | **OR** — 체크한 선택지 중 하나라도 맞으면 통과 |
| **전부 체크** | **AND 조건 대상** |
| **일부 체크** | **AND 조건 대상** |
| **전부 해제** | 그 축만 AND 조건에서 **제외**. 나머지 축 조건으로 계속 조회한다 |

초기 상태는 화면상 **전부 체크**이며, 조건으로도 전부 체크와 같게 다룬다.

### 6.2 상태 표현

`facetCategoryIds: number[] | null`

| 값 | 의미 | 화면 |
|---|---|---|
| `null` | 미설정(초기) | 전부 체크 |
| `[]` | 사용자가 전부 해제 | 전부 해제 |
| 그 외 | 체크된 id | 그대로 |

`null` 과 `[]` 는 **서버 조건으로는 같고 화면 표시만 다르다.** 둘을 합치면 「전부 해제」 버튼이 듣지 않는 것처럼 보인다.
전체 id 를 state 에 채우지 않는 이유 — 축 데이터가 비동기라 `useEffect` 안 setState 가 필요해지고(React Compiler 금지), 서버 전송에도 불리하다.

### 6.3 알려진 영향

조건이 걸린 축은 **그 축에 분류가 없는 자료를 탈락**시킨다. 개발 DB 기준 `資料分類` 는 3,252건 중 50건에만 연결돼 있어, 전 축을 조건으로 쓰면 28건까지 줄어든다.
**규칙의 문제가 아니라 카테고리 데이터 미정리 문제**다 — 자료에 분류를 채우면 해소된다.

---

## 7. 화면 설계

### 7.1 콘텐츠 목록 — 좌측 영역 (목업 v0.94 기준)

위에서 아래로:

1. **`探し方` 카드** — `資料から探す` / `製品から探す`. 기본 **제품에서 찾기**
2. **`カテゴリ` 헤더** — `すべて選択` / `すべて解除`
3. **`型番（製品一覧）` 축** — 제품일람 모드에서만. 카테고리별 **기본 10건**, 초과 시 `すべて表示`
4. **동적 분류축** — `resolveVisibleAxes()` 결과 순서(카테고리 `sortOrder`)
5. **관리자 전용 필터 3개** — `掲示対象` 셀렉트 · `社内会員の掲示のみ表示` 체크 · `担当部門`(복수선택)

5번은 **`isInternal && view === "doc"`** 조건이다. 사내 직원만, 그리고 자료에서 찾기 모드에서만.
제품일람은 형번의 행이라 게시대상·담당부문으로 거르는 것이 의미를 갖지 않는다.

**⑤ 연동**: `社内会員の掲示のみ表示` 체크 시 `掲示対象` 셀렉트를 **비활성화하고 값을 비운다**. 서버도 `internalOnly` 분기에서 `roleCode` 를 무시하므로, 켜져 있지만 결과에 영향 없는 입력을 남기지 않는다.

모바일(≤1023px)에서는 `[資料一覧][製品一覧][フィルタ▼]` 한 줄로 바뀐다 — 좁은 화면에서 모드 전환이 패널 안에 숨으면 안 된다.

### 7.2 사내전용 표기

| 대상 | 표기 |
|---|---|
| 사내전용 **자료** 행 | 배경 `#FDF2F2`, hover `#FBE4E4` (`.ag-row-internal`). 모바일 카드도 동일 |
| 사내전용 **카테고리 2Depth** | 텍스트 `#FF1A1A` (`INTERNAL_CATEGORY_TEXT_CLASS`) |
| 사내전용 **카테고리 1Depth** | **기본색** — 축 제목까지 붉으면 개별 분류가 묻힌다 (2026-10-23 결정) |

적색은 **체크·hover 등 상태와 무관하게 유지**한다. 선택 중에 링크색으로 덮이면 사내전용 여부를 읽을 수 없다.

`.ag-row-internal` 은 CSS 에서 `.ag-row:hover` **뒤에** 선언해야 한다(동일 특이도).

목록 셀의 적색 판정은 **카테고리 트리**를 소스로 한다. 목록 응답의 `isInternalOnly` 는 조회 시점 스냅샷이라, 카테고리 설정 직후 좌측만 바뀌고 셀은 옛 색으로 남는다.

### 7.3 본문 폭

`--page-max: 98%` (`globals.css`). 종전 1440px 고정을 2026-10-22 요청으로 변경했다.
로그인·GNB·푸터·각 화면 카드가 모두 이 변수를 참조한다. 적용 지점은 전부 전폭 컨테이너의 **직계 자식**이라 98% 가 중첩되지 않는다.

관리 화면(카테고리관리·형번관리)은 좌 목록 : 우 상세 = **6:4**. 형번관리의 종전 `520px` 고정은 본문이 1440px 이던 시절의 값(≈36%)이라 가변폭에서 전제가 깨졌다.

---

## 8. Zod Schemas

| 파일 | 내용 |
|---|---|
| `src/lib/schemas/product-model.ts` | 형번 등록·수정·목록 쿼리. 유저 대면 메시지는 **일본어** |
| `src/lib/schemas/content.ts` | `productModelIds`, `facetCategoryIds`, `internalOnly`, `departments` 등 검색 파라미터 확장 |
| `src/lib/schemas/common.ts` | 공용 페이지네이션·정렬 |

---

## 9. Security Considerations

| 위험 | 대응 |
|---|---|
| 비공개 형번 존재 노출 | 노출 불가 형번은 **404** (403 금지) |
| 사내전용 분류명 노출 | 축 제목이 부모 카테고리명이라, 선택지가 비어도 이름이 드러난다 → 비사내에는 **축 자체를 내리지 않는다** |
| 자료 0건 형번 비활성화 | 노출범위를 반영하면 축 조회가 무거워지고, 미반영하면 **비공개 자료의 존재가 샌다** → 현재 미구현(선택해도 결과 불변이라 무해) |
| 자동완성 남용 | 비사내 keyword 요청 rate limit |
| 수정 폼의 조용한 연결 끊김 | `includeHiddenProductModels=true` 로 전량 반환 — 걸러진 상태로 폼을 채우면 저장 시 보이지 않던 연결이 끊긴다. `CONTENT.update` 보유자에게만 유효 |

---

## 10. 구현 파일 매핑

| # | 기능 | 파일 |
|---|---|---|
| 1 | DB 스키마 | `prisma/migrations/20261012000000_add_product_model/` |
| 2 | 메뉴·RBAC | `prisma/migrations/20261012010000_add_product_model_menu/` |
| 3 | 형번 API | `src/app/api/product-models/**` |
| 4 | 제품 API | `src/app/api/products/**` |
| 5 | 자동완성 API | `src/app/api/search/suggest/route.ts` |
| 6 | 판정 모듈 | `src/lib/{product-model,content-search,content-visibility,content-required-axes,content-internal-only}.ts` |
| 7 | 형번관리 화면 | `src/app/admin/product-models/`, `src/components/admin/product-models/**` |
| 8 | 제품상세 화면 | `src/app/products/[id]/`, `src/components/products/product-detail.tsx` |
| 9 | 목록 개편 | `src/components/contents/list/{contents-contents,contents-facets,contents-facet-utils,contents-search,contents-search-suggest,contents-table}.tsx` |
| 10 | 사내전용 표기 | `src/components/common/category-label.tsx`, `src/components/ag-grid/ag-grid-theme.css` |
| 11 | 본문 폭 | `src/app/globals.css` (`--page-max`) |
| 12 | E2E | `scripts/e2e/**` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-10-23 | 최초 작성 — Phase 1~9 + 목업 v0.94 추가 반영분(사내전용 행 배경색·카테고리 적색·관리자 필터 복원·폭 98%·축 결합 규칙)까지 반영 | CK |
