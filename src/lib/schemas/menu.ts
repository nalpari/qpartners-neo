import { z } from "zod";

import { menuCodeFormatSchema } from "@/lib/schemas/common";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Menu ───

export const createMenuSchema = z.object({
  parentId: z.number().int().positive().nullable().default(null),
  // menuCode 형식 강제 — 권한관리 PUT 의 `menuCodeFormatSchema` 와 동일 정규식 공유.
  // 등록 단계에서 막지 않으면 잘못된 menuCode 가 DB 에 남아 권한관리 저장이 차단됨 (Redmine #2164).
  menuCode: menuCodeFormatSchema,
  menuName: z.string().min(1, "menuName은 필수입니다").max(100),
  pageUrl: z.string().max(500).nullable().default(null),
  isActive: z.boolean().default(true),
  showInTopNav: z.boolean().default(true),
  showInMobile: z.boolean().default(true),
  // 미지정 시 서버가 같은 parentId 그룹의 max(sortOrder)+1 로 자동 부여
  sortOrder: z.number().int().positive().optional(),
});

export const updateMenuSchema = z.object({
  menuName: z.string().min(1, "menuName은 필수입니다").max(100).optional(),
  pageUrl: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  showInTopNav: z.boolean().optional(),
  showInMobile: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional(),
});

export const sortMenuSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.number().int().positive(),
          sortOrder: z.number().int().positive(),
        }),
      )
      .min(1, "items는 1개 이상이어야 합니다"),
  })
  .refine(
    (data) => {
      const ids = data.items.map((i) => i.id);
      return new Set(ids).size === ids.length;
    },
    { message: "중복된 id가 존재합니다", path: ["items"] },
  );

// ─── Types ───

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type SortMenuInput = z.infer<typeof sortMenuSchema>;
