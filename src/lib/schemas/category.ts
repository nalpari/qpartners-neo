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
