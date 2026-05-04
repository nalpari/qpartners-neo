import { z } from "zod";

import { targetTypeValues } from "@/lib/schemas/common";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Content ───

const contentTargetSchema = z
  .object({
    targetType: z.enum(targetTypeValues),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) return data.startAt <= data.endAt;
      return true;
    },
    { message: "開始日は終了日以前に設定してください", path: ["startAt"] },
  );

export const createContentSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(500),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.coerce.date().optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
});

export const updateContentSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(500).optional(),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
});

export const listContentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // pageSize 는 PAGE_SIZE 공통코드(/api/codes/lookup)가 단일 출처로, 운영자가 코드관리 UI 에서
  // 자유 등록(5/20/50/100 등) 하므로 서버 측 화이트리스트(`[20,50,100]`) 강제는 운영 불가.
  // downloadLogsQuerySchema 와 동일하게 양의 정수 + 상한(100) 만 둔다 — 상한은 단일 요청 폭주 방지.
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().max(100).optional(),
  categoryIds: z.string().optional(),
  status: z.enum(["draft", "published", "deleted"]).default("published"),
  targetType: z.enum(targetTypeValues).optional(),
  department: z.string().optional(),
  internalOnly: z.coerce.boolean().default(false),
  sort: z.enum(["newest", "oldest", "views", "updated"]).default("newest"),
});

export const downloadLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().max(100).optional(),
});

// ─── Types ───

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ListContentsQuery = z.infer<typeof listContentsQuerySchema>;
export type DownloadLogsQuery = z.infer<typeof downloadLogsQuerySchema>;
