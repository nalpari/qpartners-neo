import { z } from "zod";

import { idParamSchema } from "@/lib/schemas/common";

// ─── 목록 쿼리 파라미터 ───

export const massMailListQuerySchema = z.object({
  keyword: z.string().optional(),
  target: z.string().optional(),
  draftOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type MassMailListQuery = z.infer<typeof massMailListQuerySchema>;

// ─── 등록 요청 (FormData에서 파싱) ───

/** FormData 문자열 "true"/"false" → boolean 변환 (z.coerce.boolean은 "false"를 true로 처리하므로 별도 transform) */
const formBool = z.string().default("false").transform((v) => v === "true");

export const massMailCreateSchema = z.object({
  senderName: z.string().min(1, "送信者名は必須です").max(255),
  targetSuperAdmin: formBool,
  targetAdmin: formBool,
  targetFirstDealer: formBool,
  targetSecondDealer: formBool,
  targetConstructor: formBool,
  targetGeneral: formBool,
  optOut: formBool,
  subject: z.string().min(1, "件名は必須です").max(500),
  body: z.string().min(1, "本文は必須です"),
  status: z.enum(["draft", "pending"]),
});

export type MassMailCreateInput = z.infer<typeof massMailCreateSchema>;

// ─── 발송대상 라벨 매핑 ───

/** DB 모델의 target boolean 필드명 */
export const TARGET_KEYS = [
  "targetSuperAdmin", "targetAdmin", "targetFirstDealer",
  "targetSecondDealer", "targetConstructor", "targetGeneral",
] as const;

export type TargetKey = (typeof TARGET_KEYS)[number];

export const TARGET_LABELS: { key: TargetKey; label: string; responseKey: string }[] = [
  { key: "targetSuperAdmin", label: "スーパー管理者", responseKey: "super_admin" },
  { key: "targetAdmin", label: "管理者", responseKey: "admin" },
  { key: "targetFirstDealer", label: "1次販売店", responseKey: "first_store" },
  { key: "targetSecondDealer", label: "2次以降販売店", responseKey: "second_store" },
  { key: "targetConstructor", label: "施工店", responseKey: "seko" },
  { key: "targetGeneral", label: "一般", responseKey: "general" },
];

/** label → DB 필드명 매핑 (목록 API target 필터용) */
export const TARGET_FILTER_MAP: Record<string, TargetKey> = Object.fromEntries(
  TARGET_LABELS.map((t) => [t.label, t.key]),
) as Record<string, TargetKey>;

// ─── ID 파라미터 ───

export { idParamSchema as massMailIdParamSchema };
