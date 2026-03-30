import { z } from "zod";

// ─── Shared ───

/** URL path parameter ID 검증 (code.ts에서 재사용 가능하지만 독립성 유지) */
export const idParamSchema = z.coerce
  .number()
  .int("ID는 정수여야 합니다")
  .positive("ID는 양수여야 합니다");

// ─── Category ───

export const createCategorySchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  categoryCode: z.string().min(1, "categoryCode는 필수입니다").max(50),
  name: z.string().min(1, "name은 필수입니다").max(100),
  isInternalOnly: z.boolean().default(false),
  sortOrder: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1, "name은 필수입니다").max(100).optional(),
  isInternalOnly: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

// ─── Types ───

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
