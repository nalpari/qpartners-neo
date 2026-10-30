import { z } from "zod";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Category ───

export const createCategorySchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  categoryCode: z.string().min(1, "categoryCode는 필수입니다").max(50),
  name: z.string().min(1, "name은 필수입니다").max(100),
  isInternalOnly: z.boolean().default(false),
  sortOrder: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  /**
   * 제품일람(製品一覧) 노출 대상 — REQ-008, 목업 04 폼 `製品一覧表示`.
   * 전 카테고리에 저장 가능하나 실제 사용은 2Depth 한정이다(1Depth 값은 무시된다) —
   * 형번 등록 시점에 `/api/product-models` 가 2Depth + 이 플래그를 함께 검증한다.
   */
  isProductList: z.boolean().default(false),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1, "name은 필수입니다").max(100).optional(),
  isInternalOnly: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  isProductList: z.boolean().optional(),
});

// ─── Types ───

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
