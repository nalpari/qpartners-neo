import { z } from "zod";

import { authRoleValues, menuCodeValues } from "@/lib/schemas/common";

// ─── Role ───

/**
 * roleCode path parameter 검증.
 * authRole ↔ QpRole.roleCode 는 1:1 동일 (authRoleValues 6개).
 * enum 으로 좁혀 알 수 없는 roleCode 는 path param 파싱 단계에서 400 거부.
 */
export const roleCodeParamSchema = z.enum(authRoleValues);

/**
 * roleCode 는 authRoleValues 6개 외 생성을 허용하지 않는다.
 * enum 밖으로 등록하면 이후 GET/PUT /api/roles/:roleCode(/permissions) 는 path param 파싱에서 400 이 되어
 * 좀비 row 가 된다. 초기 설계상 역할 스키마는 고정이므로 생성 단계에서도 enum 으로 좁힌다.
 */
export const createRoleSchema = z.object({
  roleCode: z.enum(authRoleValues),
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
            // menuCode 는 whitelist 고정. 임의 문자열 삽입 시 lockout 가드의 정확 비교
            // (`menuCode === "PERMISSIONS"`) 를 trivially 우회할 수 있어 schema 단에서 차단한다.
            menuCode: z.enum(menuCodeValues),
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
