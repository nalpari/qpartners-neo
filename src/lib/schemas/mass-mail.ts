import { z } from "zod";

import { idParamSchema } from "@/lib/schemas/common";

// ─── 목록 쿼리 파라미터 ───

export const massMailListQuerySchema = z.object({
  keyword: z.string().max(200).optional(),
  // target 필터 — responseKey 기반 ASCII 키 ("super_admin", "admin", "first_store" 등)
  target: z.string().optional(),
  // z.coerce.boolean은 "false"를 true로 변환하므로, 명시적 transform으로 처리
  draftOnly: z.string().optional().transform((v) => v === "true"),
  // 登録者 검색
  authorSearchType: z.enum(["name", "id"]).optional(),
  authorQuery: z.string().min(2, "検索語は2文字以上入力してください").max(200).optional(),
  // 登録日(createdAt) 범위 검색 — YYYY-MM-DD 포맷 + 実日付 検証 (タイムゾーン安全)
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "日付はYYYY-MM-DD形式で入力してください" })
    .refine((v) => !isNaN(new Date(`${v}T00:00:00+09:00`).getTime()), { message: "有効な日付を入力してください" })
    .optional(),
  endDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "日付はYYYY-MM-DD形式で入力してください" })
    .refine((v) => !isNaN(new Date(`${v}T00:00:00+09:00`).getTime()), { message: "有効な日付を入力してください" })
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) return data.startDate <= data.endDate;
    return true;
  },
  { message: "開始日は終了日以前に設定してください", path: ["startDate"] },
);

export type MassMailListQuery = z.infer<typeof massMailListQuerySchema>;

// ─── 등록 요청 (FormData에서 파싱) ───

/** FormData 문자열 "true"/"false" → boolean 변환 (z.coerce.boolean은 "false"를 true로 처리하므로 별도 transform) */
const formBool = z.string().default("false").transform((v) => v === "true");

export const massMailCreateSchema = z.object({
  senderName: z.string().min(1, "送信者名は必須です").max(255),
  targetSuperAdmin: formBool,
  targetAdmin: formBool,
  targetFirstStore: formBool,
  targetSecondStore: formBool,
  targetConstructor: formBool,
  targetGeneral: formBool,
  optOut: formBool,
  // 이메일 헤더 인젝션 방어 — subject에 개행 문자 금지
  subject: z.string().min(1, "件名は必須です").max(500)
    .refine((v) => !/[\r\n]/.test(v), { message: "件名に改行を含めることはできません" }),
  body: z.string().min(1, "本文は必須です"),
  status: z.enum(["draft", "pending"]),
});

export type MassMailCreateInput = z.infer<typeof massMailCreateSchema>;

// ─── 발송대상 라벨 매핑 ───

/** DB 모델의 target boolean 필드명 */
export const TARGET_KEYS = [
  "targetSuperAdmin", "targetAdmin", "targetFirstStore",
  "targetSecondStore", "targetConstructor", "targetGeneral",
] as const;

export type TargetKey = (typeof TARGET_KEYS)[number];

export const TARGET_LABELS: { key: TargetKey; label: string; responseKey: string }[] = [
  { key: "targetSuperAdmin", label: "スーパー管理者", responseKey: "super_admin" },
  { key: "targetAdmin", label: "管理者", responseKey: "admin" },
  { key: "targetFirstStore", label: "1次販売店", responseKey: "first_store" },
  { key: "targetSecondStore", label: "2次以降販売店", responseKey: "second_store" },
  { key: "targetConstructor", label: "施工店", responseKey: "seko" },
  { key: "targetGeneral", label: "一般", responseKey: "general" },
];

/**
 * responseKey → DB 필드명 매핑 (목록 API target 필터용).
 * 기존: label(일본어) 기반 → URL에 일본어 강제. 변경: responseKey(ASCII) 기반.
 * ?target=super_admin, ?target=first_store 등으로 사용.
 */
export const TARGET_FILTER_MAP: Record<string, TargetKey> = {
  super_admin: "targetSuperAdmin",
  admin: "targetAdmin",
  first_store: "targetFirstStore",
  second_store: "targetSecondStore",
  seko: "targetConstructor",
  general: "targetGeneral",
};

// ─── 발송대상 공통 유틸 ───

/** 발송대상 boolean → 객체 (responseKey 기반) */
export function buildTargetsObject(mail: Record<TargetKey, boolean>): Record<string, boolean> {
  const targets: Record<string, boolean> = {};
  for (const t of TARGET_LABELS) {
    targets[t.responseKey] = mail[t.key] === true;
  }
  return targets;
}

/** 발송대상 boolean → 콤마 구분 라벨 문자열 */
export function buildTargetLabel(mail: Record<TargetKey, boolean>): string {
  return TARGET_LABELS
    .filter((t) => mail[t.key] === true)
    .map((t) => t.label)
    .join(", ") || "—";
}

// ─── ID 파라미터 ───

export { idParamSchema as massMailIdParamSchema };
