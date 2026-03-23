import { z } from "zod";

// ─── CodeHeader ───

export const createCodeHeaderSchema = z.object({
  headerCode: z.string().min(1, "headerCode는 필수입니다").max(20),
  headerId: z.string().min(1, "headerId는 필수입니다").max(50),
  headerName: z.string().min(1, "headerName은 필수입니다").max(255),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relCode3: z.string().max(50).nullable().default(null),
  relNum1: z.number().nullable().default(null),
  relNum2: z.number().nullable().default(null),
  relNum3: z.number().nullable().default(null),
  isActive: z.boolean().default(true),
});

export const updateCodeHeaderSchema = createCodeHeaderSchema
  .omit({ headerCode: true })
  .partial();

// ─── CodeDetail ───

export const createCodeDetailSchema = z.object({
  code: z.string().min(1, "code는 필수입니다").max(20),
  displayCode: z.string().min(1, "displayCode는 필수입니다").max(20),
  codeName: z.string().min(1, "codeName은 필수입니다").max(255),
  codeNameEtc: z.string().max(255).nullable().default(null),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relNum1: z.number().nullable().default(null),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCodeDetailSchema = createCodeDetailSchema.partial();

// ─── Types ───

export type CreateCodeHeaderInput = z.infer<typeof createCodeHeaderSchema>;
export type UpdateCodeHeaderInput = z.infer<typeof updateCodeHeaderSchema>;
export type CreateCodeDetailInput = z.infer<typeof createCodeDetailSchema>;
export type UpdateCodeDetailInput = z.infer<typeof updateCodeDetailSchema>;
