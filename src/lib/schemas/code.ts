import { z } from "zod";

// ─── Shared ───

/** Prisma Decimal(15,2) 호환 — number/string 입력을 string으로 변환하여 정밀도 보존 */
const decimalField = z
  .union([z.number(), z.string()])
  .transform(String)
  .pipe(
    z.string().regex(/^-?\d{1,13}(\.\d{1,2})?$/, "유효한 소수 형식이 아닙니다"),
  )
  .nullable()
  .default(null);

/** URL path parameter ID 검증 */
export const idParamSchema = z.coerce
  .number()
  .int("ID는 정수여야 합니다")
  .positive("ID는 양수여야 합니다");

// ─── CodeHeader ───

export const createCodeHeaderSchema = z.object({
  headerCode: z.string().min(1, "headerCode는 필수입니다").max(20),
  headerId: z.string().min(1, "headerId는 필수입니다").max(50),
  headerName: z.string().min(1, "headerName은 필수입니다").max(255),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relCode3: z.string().max(50).nullable().default(null),
  relNum1: decimalField,
  relNum2: decimalField,
  relNum3: decimalField,
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
  relNum1: decimalField,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCodeDetailSchema = createCodeDetailSchema.partial();

// ─── Types ───

export type CreateCodeHeaderInput = z.infer<typeof createCodeHeaderSchema>;
export type UpdateCodeHeaderInput = z.infer<typeof updateCodeHeaderSchema>;
export type CreateCodeDetailInput = z.infer<typeof createCodeDetailSchema>;
export type UpdateCodeDetailInput = z.infer<typeof updateCodeDetailSchema>;
