import { z } from "zod";

// ─── Shared ───

export const idParamSchema = z.coerce
  .number()
  .int("ID는 정수여야 합니다")
  .positive("ID는 양수여야 합니다");

// ─── HomeNotice ───

const targetFields = {
  targetSuperAdmin: z.boolean().default(false),
  targetAdmin: z.boolean().default(false),
  targetFirstDealer: z.boolean().default(false),
  targetSecondDealer: z.boolean().default(false),
  targetConstructor: z.boolean().default(false),
  targetGeneral: z.boolean().default(false),
};

export const createHomeNoticeSchema = z
  .object({
    ...targetFields,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    content: z.string().min(1, "content는 필수입니다"),
    url: z.string().url().max(500).nullable().default(null),
  })
  .refine(
    (data) =>
      data.targetSuperAdmin ||
      data.targetAdmin ||
      data.targetFirstDealer ||
      data.targetSecondDealer ||
      data.targetConstructor ||
      data.targetGeneral,
    { message: "게시대상을 최소 1개 이상 선택하세요" },
  );

export const updateHomeNoticeSchema = z
  .object({
    ...targetFields,
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    content: z.string().min(1, "content는 필수입니다").optional(),
    url: z.string().url().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      // target 필드가 하나라도 명시적으로 전달된 경우에만 검증
      const hasTarget =
        data.targetSuperAdmin ||
        data.targetAdmin ||
        data.targetFirstDealer ||
        data.targetSecondDealer ||
        data.targetConstructor ||
        data.targetGeneral;
      return hasTarget;
    },
    { message: "게시대상을 최소 1개 이상 선택하세요" },
  );

// ─── Types ───

export type CreateHomeNoticeInput = z.infer<typeof createHomeNoticeSchema>;
export type UpdateHomeNoticeInput = z.infer<typeof updateHomeNoticeSchema>;
