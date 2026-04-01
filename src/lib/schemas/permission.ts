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

export const updatePermissionsSchema = z
  .object({
    permissions: z
      .array(
        z
          .object({
            menuCode: z.string().min(1, "menuCode는 필수입니다").max(50),
            canRead: z.boolean().default(false),
            canCreate: z.boolean().default(false),
            canUpdate: z.boolean().default(false),
            canDelete: z.boolean().default(false),
          })
          .refine(
            (data) => {
              if (data.canCreate || data.canUpdate || data.canDelete) return data.canRead;
              return true;
            },
            { message: "CUD 권한이 있으면 읽기 권한(canRead)도 필요합니다" },
          ),
      )
      .min(1, "permissions는 1개 이상이어야 합니다"),
  })
  .refine(
    (data) => {
      const codes = data.permissions.map((p) => p.menuCode);
      return new Set(codes).size === codes.length;
    },
    { message: "중복된 menuCode가 존재합니다", path: ["permissions"] },
  );

// ─── Types ───

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
