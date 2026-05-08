import { z } from "zod";

export { idParamSchema } from "@/lib/schemas/common";

// ─── HomeNotice ───

/**
 * 권한 코드 형식 — qp_roles.role_code 와 동일.
 * 6 기본 권한 + 운영자 정의 추가 권한 모두 허용 (Target Dynamic from Role 후).
 */
const roleCodeSchema = z
  .string()
  .min(1, "権限コードは必須です")
  .max(50)
  .regex(/^[A-Z0-9][A-Z0-9_]*$/, "権限コードの形式が正しくありません");

export const createHomeNoticeSchema = z
  .object({
    /** 게시대상 권한코드 배열 — qp_roles 동적 (6 기본 + 추가 권한). 1 개 이상 필수. 중복 자동 제거. */
    targetRoleCodes: z
      .array(roleCodeSchema)
      .min(1, "掲載対象を1つ以上選択してください")
      .transform((arr) => [...new Set(arr)]),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    title: z
      .string()
      .min(1, "タイトルは必須です")
      .max(100, "タイトルは100文字以内で入力してください"),
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
  // Issue #2176 (2) — 시작일==종료일 허용 (`<` → `<=`).
  .refine((data) => data.startAt <= data.endAt, {
    message: "開始日は終了日より前に設定してください",
    path: ["startAt"],
  });

export const updateHomeNoticeSchema = z
  .object({
    /** 게시대상 권한코드 배열 — 부분 수정 시 미전송 가능. 전송 시 1 개 이상 필수. 중복 자동 제거. */
    targetRoleCodes: z
      .array(roleCodeSchema)
      .min(1, "掲載対象を1つ以上選択してください")
      .transform((arr) => [...new Set(arr)])
      .optional(),
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
      // Issue #2176 (2) — 시작일==종료일 허용.
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

// ─── Types ───

export type CreateHomeNoticeInput = z.infer<typeof createHomeNoticeSchema>;
export type UpdateHomeNoticeInput = z.infer<typeof updateHomeNoticeSchema>;
