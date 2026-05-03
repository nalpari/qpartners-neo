import { z } from "zod";

import { menuCodeFormatSchema, roleCodeFormatSchema } from "@/lib/schemas/common";

// ─── Role ───

/**
 * roleCode path parameter 검증 — 형식 제약 (영대문자 시작 + 영대문자/숫자/_, 50자 이내).
 *
 * 과거 `z.enum(authRoleValues)` 로 6개에 좁혀 신규 등록 권한이 path param 파싱에서 400 이 되어
 * GET/PUT 자체가 막히는 좀비 상태가 됐다 (Redmine #2165). authRoleValues 는 RBAC 가드의 하드코딩
 * 분기 식별자로 유지하되, path param 은 형식 검증만 수행해 신규 등록 권한도 정상 조회·수정 가능.
 */
export const roleCodeParamSchema = roleCodeFormatSchema;

/**
 * 권한 등록 schema — roleCode 자유 등록 허용 (formatSchema 형식 검증만).
 * authRoleValues 6개 외에도 사용자 정의 권한을 등록할 수 있고, 매트릭스 기반 RBAC 로 자동 동작 (Redmine #2165).
 */
export const createRoleSchema = z.object({
  roleCode: roleCodeFormatSchema,
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
            // menuCode 는 메뉴관리 UI 에서 신규 등록 가능하므로 enum 하드코딩 대신 형식만 검증.
            // 존재 여부는 route handler 가 DB 조회(qp_menus) 로 일괄 확인 — 임의 문자열 주입은
            // FK + route 검증 두 단계에서 막힌다. 메뉴 등록 schema 와 형식 정의를 공유 (common.ts)
            // 하여 등록·수정·매트릭스 PUT 의 검증 기준을 단일화 (Redmine #2164).
            menuCode: menuCodeFormatSchema,
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
