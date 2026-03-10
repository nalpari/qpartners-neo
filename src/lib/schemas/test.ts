import { z } from "zod";

export const createTestSchema = z.object({
  title: z.string().min(1, "title은 필수입니다").max(255),
  content: z.string().nullable().optional(),
});

export const updateTestSchema = z.object({
  title: z.string().min(1, "title은 필수입니다").max(255).optional(),
  content: z.string().nullable().optional(),
});

export type CreateTestInput = z.infer<typeof createTestSchema>;
export type UpdateTestInput = z.infer<typeof updateTestSchema>;
