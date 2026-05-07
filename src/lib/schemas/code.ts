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

export { idParamSchema } from "@/lib/schemas/common";

// ─── CodeHeader ───

export const createCodeHeaderSchema = z.object({
  headerCode: z.string().min(1, "headerCode는 필수입니다").max(20),
  headerAlias: z.string().min(1, "headerAlias는 필수입니다").max(50),
  headerName: z.string().min(1, "headerName은 필수입니다").max(255),
  relCode1: z.string().max(100).nullable().default(null),
  relCode2: z.string().max(100).nullable().default(null),
  relCode3: z.string().max(100).nullable().default(null),
  relNum1: decimalFieldCreate,
  relNum2: decimalFieldCreate,
  relNum3: decimalFieldCreate,
  isActive: z.boolean().default(true),
});

export const updateCodeHeaderSchema = z.object({
  headerAlias: z.string().min(1, "headerAlias는 필수입니다").max(50).optional(),
  headerName: z.string().min(1, "headerName은 필수입니다").max(255).optional(),
  relCode1: z.string().max(100).nullable().optional(),
  relCode2: z.string().max(100).nullable().optional(),
  relCode3: z.string().max(100).nullable().optional(),
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
  relCode1: z.string().max(100).nullable().default(null),
  relCode2: z.string().max(100).nullable().default(null),
  relCode3: z.string().max(100).nullable().default(null),
  relNum1: decimalFieldCreate,
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCodeDetailSchema = z.object({
  code: z.string().min(1, "code는 필수입니다").max(20).optional(),
  displayCode: z.string().min(1, "displayCode는 필수입니다").max(20).optional(),
  codeName: z.string().min(1, "codeName은 필수입니다").max(255).optional(),
  codeNameEtc: z.string().max(255).nullable().optional(),
  relCode1: z.string().max(100).nullable().optional(),
  relCode2: z.string().max(100).nullable().optional(),
  relCode3: z.string().max(100).nullable().optional(),
  relNum1: decimalFieldUpdate,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ─── Response Schemas (프론트 응답 safeParse 검증 및 z.infer 타입 파생용) ───

/**
 * Prisma JSON 직렬화 후 클라이언트가 받는 CodeHeader 형태.
 * - Date → ISO string
 * - Decimal(15,2) → string | null
 * - Boolean → boolean
 */
export const codeHeaderResponseSchema = z.object({
  id: z.number().int(),
  headerCode: z.string(),
  headerAlias: z.string(),
  headerName: z.string(),
  relCode1: z.string().nullable(),
  relCode2: z.string().nullable(),
  relCode3: z.string().nullable(),
  relNum1: z.string().nullable(),
  relNum2: z.string().nullable(),
  relNum3: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const codeHeaderListResponseSchema = z.object({
  data: z.array(codeHeaderResponseSchema),
});

export const codeDetailResponseSchema = z.object({
  id: z.number().int(),
  headerId: z.number().int(),
  code: z.string(),
  displayCode: z.string(),
  codeName: z.string(),
  codeNameEtc: z.string().nullable(),
  relCode1: z.string().nullable(),
  relCode2: z.string().nullable(),
  relCode3: z.string().nullable(),
  relNum1: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const codeDetailListResponseSchema = z.object({
  data: z.array(codeDetailResponseSchema),
});

// ─── SEC_AUTH_VALIDITY 가드 (Boston 리뷰 HIGH #2) ───

/**
 * SEC_AUTH_VALIDITY 공통코드 값의 허용 범위 (일수).
 *
 * 2FA "신규가입 유예기간" 과 "secAuthDt 재인증 주기" 에 공용 적용되는 값이라
 * 무제한 입력을 허용하면 9999 같은 값으로 사실상 2FA 가 무력화될 수 있다.
 * 등록/수정 단계에서 본 범위로 강제 클램프한다.
 *
 * 하한 1: 0/음수는 의미 없음, 1일 미만은 재인증 주기로 비현실.
 * 상한 90: 보안 정책상 분기 단위 재인증을 상한선으로 둔다 (필요 시 정책에 맞춰 조정).
 */
export const SEC_AUTH_VALIDITY_MIN_DAYS = 1;
export const SEC_AUTH_VALIDITY_MAX_DAYS = 90;
export const SEC_AUTH_VALIDITY_HEADER_CODE = "SEC_AUTH_VALIDITY";

/**
 * SEC_AUTH_VALIDITY 헤더에 등록되는 code 값(일수 문자열) 검증.
 * 다른 헤더 코드는 검증을 건너뛴다 (no-op → ok=true).
 *
 * @param headerCode CodeHeader.headerCode (대상 식별)
 * @param codeValue  CodeDetail.code (일수 문자열, 예: "10")
 */
export function validateSecAuthValidityCode(
  headerCode: string,
  codeValue: string,
): { ok: true } | { ok: false; message: string } {
  if (headerCode !== SEC_AUTH_VALIDITY_HEADER_CODE) return { ok: true };

  const days = Number(codeValue);
  if (
    !Number.isSafeInteger(days) ||
    days < SEC_AUTH_VALIDITY_MIN_DAYS ||
    days > SEC_AUTH_VALIDITY_MAX_DAYS
  ) {
    return {
      ok: false,
      message: `SEC_AUTH_VALIDITY は ${SEC_AUTH_VALIDITY_MIN_DAYS}〜${SEC_AUTH_VALIDITY_MAX_DAYS} 日の整数で入力してください`,
    };
  }
  return { ok: true };
}

// ─── Types ───

export type CreateCodeHeaderInput = z.infer<typeof createCodeHeaderSchema>;
export type UpdateCodeHeaderInput = z.infer<typeof updateCodeHeaderSchema>;
export type CreateCodeDetailInput = z.infer<typeof createCodeDetailSchema>;
export type UpdateCodeDetailInput = z.infer<typeof updateCodeDetailSchema>;
export type CodeHeaderResponse = z.infer<typeof codeHeaderResponseSchema>;
export type CodeDetailResponse = z.infer<typeof codeDetailResponseSchema>;
