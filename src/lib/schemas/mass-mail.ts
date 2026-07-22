import { z } from "zod";

import { idParamSchema } from "@/lib/schemas/common";

const ROLE_CODE_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;

const roleCodeSchema = z
  .string()
  .min(1, "権限コードは必須です")
  .max(50)
  .regex(ROLE_CODE_FORMAT, "権限コードの形式が正しくありません");

// ─── 목록 쿼리 파라미터 ───

export const massMailListQuerySchema = z.object({
  keyword: z.string().max(200).optional(),
  // 게시대상 권한코드 필터 — qp_roles 동적 (6 기본 + 추가 권한). 단일 또는 comma-separated.
  roleCode: z.string().optional(),
  draftOnly: z.string().optional().transform((v) => v === "true"),
  authorSearchType: z.enum(["name", "id"]).optional(),
  authorQuery: z.string().min(2, "検索語は2文字以上入力してください").max(200).optional(),
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

const formBool = z.string().default("false").transform((v) => v === "true");

/**
 * targetRoleCodes 는 FormData 에서 JSON array 또는 comma-separated 형식으로 전달.
 * - 우선 JSON 시도 → array of roleCode 매칭
 * - 실패 시 comma split fallback
 */
const targetRoleCodesField = z
  .string()
  .min(1, "送信先を1つ以上選択してください")
  .transform((val, ctx) => {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) {
        const result = z.array(roleCodeSchema).min(1).safeParse(parsed);
        if (result.success) return [...new Set(result.data)];
      }
    } catch (jsonError: unknown) {
      void jsonError; /* fallthrough — JSON 파싱 실패 시 comma split fallback */
    }
    const codes = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    const result = z.array(roleCodeSchema).min(1).safeParse(codes);
    if (result.success) return [...new Set(result.data)];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "送信先権限コードの形式が正しくありません",
    });
    return z.NEVER;
  });

export const massMailCreateSchema = z.object({
  // SMTP From 헤더 display name 으로 사용. mailer.sanitizeFromName 이 2차 방어하지만,
  // DB 에 저장되는 값이 1차에서 깨끗해야 향후 sanitizeFromName 변경 시 회귀 차단.
  senderName: z.string().min(1, "送信者名は必須です").max(255)
    .refine((v) => !/[\r\n]/.test(v), { message: "送信者名に改行を含めることはできません" }),
  /** 게시대상 권한코드 배열 — qp_roles FK (Target Dynamic from Role 후) */
  targetRoleCodes: targetRoleCodesField,
  optOut: formBool,
  subject: z.string().min(1, "件名は必須です").max(500)
    .refine((v) => !/[\r\n]/.test(v), { message: "件名に改行を含めることはできません" }),
  body: z.string().min(1, "本文は必須です"),
  status: z.enum(["draft", "pending"]),
  /**
   * 예약발송 일시 — FormData 문자열(ISO, Date.toISOString())로 전달. 즉시발송은 미전송(서버가 now 세팅).
   * 존재 시 유효한 datetime 이어야 하며, 미래 여부(예약 유효성)는 라우트에서 검증(create 400 / edit 409).
   * 빈 문자열/미전송은 undefined 로 정규화.
   */
  scheduledSendAt: z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val.trim() === "") return undefined;
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "配信日時の形式が正しくありません" });
        return z.NEVER;
      }
      return d;
    }),
});

export type MassMailCreateInput = z.infer<typeof massMailCreateSchema>;

// ─── ID 파라미터 ───

export { idParamSchema as massMailIdParamSchema };
