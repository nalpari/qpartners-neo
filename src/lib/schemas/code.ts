import { z } from "zod";

// ─── Shared ───

/** Prisma Decimal(15,2) 호환 정규식 — leading zeros 불허 */
const DECIMAL_REGEX = /^-?(?:0|[1-9]\d{0,12})(\.\d{1,2})?$/;

/** Prisma Decimal(15,2) 호환 — number/string 입력을 string으로 변환하여 정밀도 보존 (Create용, default null) */
const decimalFieldCreate = z
  .union([z.number(), z.string()])
  .transform(String)
  .pipe(z.string().regex(DECIMAL_REGEX, "유효한 소수 형식이 아닙니다"))
  .nullable()
  .default(null);

/** Prisma Decimal(15,2) 호환 — Update용, default 없음 (미전송 필드 = undefined → DB 값 유지) */
const decimalFieldUpdate = z
  .union([z.number(), z.string()])
  .transform(String)
  .pipe(z.string().regex(DECIMAL_REGEX, "유효한 소수 형식이 아닙니다"))
  .nullable()
  .optional();

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
  relNum1: decimalFieldCreate,
  relNum2: decimalFieldCreate,
  relNum3: decimalFieldCreate,
  isActive: z.boolean().default(true),
});

export const updateCodeHeaderSchema = z.object({
  headerId: z.string().min(1, "headerId는 필수입니다").max(50).optional(),
  headerName: z.string().min(1, "headerName은 필수입니다").max(255).optional(),
  relCode1: z.string().max(50).nullable().optional(),
  relCode2: z.string().max(50).nullable().optional(),
  relCode3: z.string().max(50).nullable().optional(),
  relNum1: decimalFieldUpdate,
  relNum2: decimalFieldUpdate,
  relNum3: decimalFieldUpdate,
  isActive: z.boolean().optional(),
});

// ─── CodeDetail ───

export const createCodeDetailSchema = z.object({
  code: z.string().min(1, "code는 필수입니다").max(20),
  displayCode: z.string().min(1, "displayCode는 필수입니다").max(20),
  codeName: z.string().min(1, "codeName은 필수입니다").max(255),
  codeNameEtc: z.string().max(255).nullable().default(null),
  relCode1: z.string().max(50).nullable().default(null),
  relCode2: z.string().max(50).nullable().default(null),
  relNum1: decimalFieldCreate,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCodeDetailSchema = z.object({
  code: z.string().min(1, "code는 필수입니다").max(20).optional(),
  displayCode: z.string().min(1, "displayCode는 필수입니다").max(20).optional(),
  codeName: z.string().min(1, "codeName은 필수입니다").max(255).optional(),
  codeNameEtc: z.string().max(255).nullable().optional(),
  relCode1: z.string().max(50).nullable().optional(),
  relCode2: z.string().max(50).nullable().optional(),
  relNum1: decimalFieldUpdate,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ─── Types ───

export type CreateCodeHeaderInput = z.infer<typeof createCodeHeaderSchema>;
export type UpdateCodeHeaderInput = z.infer<typeof updateCodeHeaderSchema>;
export type CreateCodeDetailInput = z.infer<typeof createCodeDetailSchema>;
export type UpdateCodeDetailInput = z.infer<typeof updateCodeDetailSchema>;
