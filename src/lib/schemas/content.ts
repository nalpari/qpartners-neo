import { z } from "zod";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Content ───

const contentTargetSchema = z
  .object({
    targetType: z.enum([
      "first_dealer",
      "second_dealer",
      "constructor",
      "general",
      "non_member",
    ]),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) return data.startAt < data.endAt;
      return true;
    },
    { message: "startAt은 endAt보다 이전이어야 합니다", path: ["startAt"] },
  );

export const createContentSchema = z.object({
  title: z.string().min(1, "title은 필수입니다").max(500),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.coerce.date().optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
});

export const updateContentSchema = z.object({
  title: z.string().min(1, "title은 필수입니다").max(500).optional(),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
});

export const listContentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((v) => [20, 50, 100].includes(v), {
      message: "pageSize must be 20, 50, or 100",
    })
    .default(20),
  keyword: z.string().optional(),
  categoryIds: z.string().optional(),
  status: z.enum(["draft", "published", "deleted"]).default("published"),
  targetType: z.string().optional(),
  department: z.string().optional(),
  internalOnly: z.coerce.boolean().default(false),
  sort: z.enum(["newest", "oldest", "views", "updated"]).default("newest"),
});

export const downloadLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().optional(),
});

// ─── Types ───

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ListContentsQuery = z.infer<typeof listContentsQuerySchema>;
export type DownloadLogsQuery = z.infer<typeof downloadLogsQuerySchema>;
