import { z } from "zod";

export { idParamSchema } from "@/lib/schemas/common";

// ─── HomeNotice ───

const targetFields = {
  targetSuperAdmin: z.boolean().default(false),
  targetAdmin: z.boolean().default(false),
  targetFirstStore: z.boolean().default(false),
  targetSecondStore: z.boolean().default(false),
  targetConstructor: z.boolean().default(false),
  targetGeneral: z.boolean().default(false),
};

export const createHomeNoticeSchema = z
  .object({
    ...targetFields,
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    title: z.string().min(1, "タイトルは必須です").max(100, "タイトルは100文字以内で入力してください"),
    content: z
      .string()
      .min(1, "内容は必須です")
      .max(200, "内容は200文字以内で入力してください"),
    url: z
      .string()
      .url()
      .max(500)
      .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
        message: "HTTP(S) URLのみ許可されています",
      })
      .nullable()
      .default(null),
  })
  .refine(
    (data) =>
      data.targetSuperAdmin ||
      data.targetAdmin ||
      data.targetFirstStore ||
      data.targetSecondStore ||
      data.targetConstructor ||
      data.targetGeneral,
    { message: "掲載対象を1つ以上選択してください" },
  )
  // Issue #2176 (2) — 시작일==종료일 허용 (`<` → `<=`).
  .refine((data) => data.startAt <= data.endAt, {
    message: "開始日は終了日より前に設定してください",
    path: ["startAt"],
  });

export const updateHomeNoticeSchema = z
  .object({
    targetSuperAdmin: z.boolean().optional(),
    targetAdmin: z.boolean().optional(),
    targetFirstStore: z.boolean().optional(),
    targetSecondStore: z.boolean().optional(),
    targetConstructor: z.boolean().optional(),
    targetGeneral: z.boolean().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    title: z
      .string()
      .min(1, "タイトルは必須です")
      .max(100, "タイトルは100文字以内で入力してください")
      .optional(),
    content: z
      .string()
      .min(1, "内容は必須です")
      .max(200, "内容は200文字以内で入力してください")
      .optional(),
    url: z
      .string()
      .url()
      .max(500)
      .refine((v) => v.startsWith("http://") || v.startsWith("https://"), {
        message: "HTTP(S) URLのみ許可されています",
      })
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      // target 필드가 하나라도 명시적으로 전달된 경우에만 최소 1개 검증
      const targetKeys = [
        "targetSuperAdmin",
        "targetAdmin",
        "targetFirstStore",
        "targetSecondStore",
        "targetConstructor",
        "targetGeneral",
      ] as const;
      const hasAnyTargetField = targetKeys.some(
        (k) => data[k] !== undefined,
      );
      if (!hasAnyTargetField) return true; // target 미전송 시 검증 스킵
      return targetKeys.some((k) => data[k] === true);
    },
    { message: "掲載対象を1つ以上選択してください" },
  )
  .refine(
    (data) => {
      // Issue #2176 (2) — 시작일==종료일 허용 (`<` → `<=`).
      if (data.startAt && data.endAt) return data.startAt <= data.endAt;
      return true;
    },
    { message: "開始日は終了日より前に設定してください", path: ["startAt"] },
  );

// ─── Helpers ───

type HomeNoticeStatus = "scheduled" | "active" | "ended";

/** status 동적 산출 (DB 컬럼 없음) */
export function computeStatus(startAt: Date, endAt: Date): HomeNoticeStatus {
  const now = new Date();
  if (now < startAt) return "scheduled";
  if (now > endAt) return "ended";
  return "active";
}

/** target Boolean 컬럼명 → 외부 API 키. 응답 본문에 DB 컬럼명을 노출하지 않기 위한 매핑. */
export const TARGET_FIELD_TO_KEY = {
  targetSuperAdmin: "super_admin",
  targetAdmin: "admin",
  targetFirstStore: "first_store",
  targetSecondStore: "second_store",
  targetConstructor: "seko",
  targetGeneral: "general",
} as const;

export type TargetField = keyof typeof TARGET_FIELD_TO_KEY;
export type TargetKey = (typeof TARGET_FIELD_TO_KEY)[TargetField];

/** target Boolean 필드를 배열로 변환 */
export function toTargetArray(row: Record<TargetField, boolean>): TargetKey[] {
  const targets: TargetKey[] = [];
  for (const [field, key] of Object.entries(TARGET_FIELD_TO_KEY) as [
    TargetField,
    TargetKey,
  ][]) {
    if (row[field]) targets.push(key);
  }
  return targets;
}

// ─── Types ───

export type CreateHomeNoticeInput = z.infer<typeof createHomeNoticeSchema>;
export type UpdateHomeNoticeInput = z.infer<typeof updateHomeNoticeSchema>;
