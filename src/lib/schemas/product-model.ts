import { z } from "zod";

import { commaIdList } from "@/lib/schemas/common";

export { idParamSchema } from "@/lib/schemas/common";

// ─── ProductModel (형번 마스터) ───

/**
 * 형번명 검색 최소 입력 길이 — 목업 `MIN_Q = 3`.
 * 3자 미만은 **검색 조건에서 제외**한다(400 이 아니라 무조건 검색). 목업
 * (`const eff = v.trim().length >= MIN_Q ? v : ""`)과 동일한 게이트다.
 */
export const MODEL_CODE_SEARCH_MIN = 3;

/**
 * 형번명 필드.
 *
 * `trim()` 으로 **앞뒤 공백을 제거**한다. 가운데 공백은 보존 — `栄信 SRシリーズ` 처럼
 * 의미를 갖는 형번이 있어, 제거하면 서로 다른 형번이 중복으로 막힌다.
 * 대소문자·뒤 공백 무시는 `qp_product_models.model_code` 콜레이션
 * (`utf8mb4_unicode_ci`, PAD SPACE)이 처리하므로 애플리케이션에서 중복으로 접지 않는다.
 */
const modelCodeField = z
  .string()
  .trim()
  .min(1, "型番は必須です")
  .max(100, "型番は100文字以内で入力してください");

/**
 * 제품상태 — 요구사항정의서 v1.1 REQ-007 의 형번 마스터 관리 항목. **필수 입력**이다
 * (목업 `03-admin-models.html:318` 의 `name="modelStatus"` 라디오가 `required`).
 *
 * 자료(콘텐츠)는 제품상태를 직접 갖지 않는다 — 자료일람 표시는 연결된 형번에서
 * 파생한다(REQ-005). `deriveProductStatus`(lib/product-model.ts) 가 그 판정을 맡는다.
 */
export const productModelStatusValues = ["current", "eol"] as const;
export const productModelStatusSchema = z.enum(productModelStatusValues, {
  message: "製品ステータスは必須です",
});

export const createProductModelSchema = z.object({
  categoryId: z.number().int().positive("カテゴリは必須です"),
  modelCode: modelCodeField,
  /** 제품상태 — 필수. 기본값을 두지 않는다(운영자가 명시적으로 고른다) */
  status: productModelStatusSchema,
  /** 표시 우선순위. 중복 허용 — 같은 값이면 형번명 昇順 (2026-10-08 리뷰 결정) */
  sortOrder: z.number().int().positive().default(1),
  isVisible: z.boolean().default(true),
});

export const updateProductModelSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  modelCode: modelCodeField.optional(),
  status: productModelStatusSchema.optional(),
  sortOrder: z.number().int().positive().optional(),
  isVisible: z.boolean().optional(),
});

/** URL query `"true"`/`"false"` → boolean. `z.coerce.boolean()` 은 `Boolean("false")===true` 라 사용 불가. */
const queryBoolean = z.preprocess(
  (val) => (val === "true" ? true : val === "false" ? false : val),
  z.boolean().optional(),
);

/** 형번관리 목록 — 03 화면 검색조건 3개(型番 / カテゴリ / 表示非表示)에 대응 */
export const listProductModelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  /** 3자 미만이면 검색 조건에서 제외 (목업 게이트와 동일) */
  modelCode: z
    .string()
    .max(100)
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed && trimmed.length >= MODEL_CODE_SEARCH_MIN ? trimmed : undefined;
    }),
  categoryId: z.coerce.number().int().positive().optional(),
  isVisible: queryBoolean,
  status: productModelStatusSchema.optional(),
  /** 미지정 시 기본 정렬 = 카테고리 표시순서 → 형번 표시순서 → 형번명 昇順 */
  sortField: z
    .enum(["modelCode", "sortOrder", "createdAt", "isVisible", "status"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

// ─── 제품일람 (제품 단위 집계) ───

/**
 * 제품일람 탭 조회.
 *
 * 자료일람과 **같은 검색·필터 조건**을 받아, 그 결과를 형번 단위로 묶어 자료 수를 센다
 * (목업 `render()` 의 `state.view === "prod"` 분기). 따라서 키워드·분류축 파라미터는
 * `listContentsQuerySchema` 와 이름·의미가 같다.
 */
export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().max(100).optional(),
  keywordOp: z.enum(["AND", "OR"]).default("AND"),
  /** 체크된 2Depth 카테고리 id. 체크가 없는 축은 조건이 아니다 */
  facetCategoryIds: commaIdList,
  /** 型番 축 — 체크된 형번 id. 미지정 시 전체 */
  productModelIds: commaIdList,
  /** 型番 헤더 클릭 정렬. 미지정 시 관련도(키워드 있을 때) → 형번 갱신일 내림차순 */
  sortField: z.enum(["modelCode", "documentCount"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

/** 제품상세 — REQ-010. 그 제품에 紐づく 자료 목록 */
export const productDetailQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ─── 자동완성 (REQ-001) ───

/** 자동완성 후보 종류별 기본 건수 — 목업 `slice(0,4)` */
export const SUGGEST_DEFAULT_LIMIT = 4;

export const suggestQuerySchema = z.object({
  q: z.string().max(100),
  /** 제품·자료 **각각**의 최대 건수 */
  limit: z.coerce.number().int().positive().max(10).default(SUGGEST_DEFAULT_LIMIT),
});

// ─── Types ───

export type CreateProductModelInput = z.infer<typeof createProductModelSchema>;
export type UpdateProductModelInput = z.infer<typeof updateProductModelSchema>;
export type ListProductModelsQuery = z.infer<typeof listProductModelsQuerySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
export type ProductModelStatus = (typeof productModelStatusValues)[number];
