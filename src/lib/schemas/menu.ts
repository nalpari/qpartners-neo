import { z } from "zod";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Menu ───

export const createMenuSchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  menuCode: z.string().min(1, "menuCode는 필수입니다").max(50),
  menuName: z.string().min(1, "menuName은 필수입니다").max(100),
  pageUrl: z.string().max(500).nullable().default(null),
  isActive: z.boolean().default(true),
  showInTopNav: z.boolean().default(true),
  showInMobile: z.boolean().default(true),
  sortOrder: z.number().int().positive().default(1),
});

export const updateMenuSchema = z.object({
  menuName: z.string().min(1, "menuName은 필수입니다").max(100).optional(),
  pageUrl: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  showInTopNav: z.boolean().optional(),
  showInMobile: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional(),
});

export const sortMenuSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        sortOrder: z.number().int().positive(),
      }),
    )
    .min(1, "items는 1개 이상이어야 합니다"),
});

// ─── Types ───

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type SortMenuInput = z.infer<typeof sortMenuSchema>;
