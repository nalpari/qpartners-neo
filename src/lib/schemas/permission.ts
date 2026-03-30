import { z } from "zod";

// ─── Role ───

export const roleCodeParamSchema = z
  .string()
  .min(1, "roleCode는 필수입니다")
  .max(50);

export const createRoleSchema = z.object({
  roleCode: z.string().min(1, "roleCode는 필수입니다").max(50),
  roleName: z.string().min(1, "roleName은 필수입니다").max(100),
  description: z.string().max(500).nullable().default(null),
  isActive: z.boolean().default(true),
});

export const updateRoleSchema = z.object({
  roleName: z.string().min(1, "roleName은 필수입니다").max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── Permission ───

export const updatePermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        menuCode: z.string().min(1, "menuCode는 필수입니다").max(50),
        canRead: z.boolean().default(false),
        canCreate: z.boolean().default(false),
        canUpdate: z.boolean().default(false),
        canDelete: z.boolean().default(false),
      }),
    )
    .min(1, "permissions는 1개 이상이어야 합니다"),
});

// ─── Types ───

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
