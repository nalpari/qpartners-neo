import { z } from "zod";

import { authRoleValues } from "@/lib/schemas/common";

/**
 * menuCode 형식 제약 — DB `qp_menus.menu_code VARCHAR(50)` 과 일치.
 * 대문자 + 숫자 + 언더스코어, 영문자로 시작. 신규 메뉴(TEST2 등) 생성도 허용.
 *
 * 주의: 본 정규식은 **형식 검증만** 수행. 실제 존재 여부는 route handler 에서 DB 조회로
 * 확인한다 (qp_menus FK). 정규식만으로 허용하면 존재하지 않는 menuCode 가 upsert 시
 * P2003(FK violation) 으로 떨어지므로, 호출부에서 사전에 일괄 검증해 400 으로 친절히 거부.
 *
 * 보안: enum 고정을 해제해도 lockout 가드는 `restrictedMenuCodeSet` (ADM_PERMISSION /
 * ADM_MENU / ADM_CODE) 의 값-기반 `.has()` 비교로 판정하므로, 임의 문자열 주입 공격이
 * 이 3종과 정확히 일치하지 않는 한 우회 불가. RESTRICTED 식별은 enum 이 아니라 Set 이
 * 단일 진실 원천 (`src/lib/schemas/common.ts`).
 */
const MENU_CODE_REGEX = /^[A-Z][A-Z0-9_]{0,49}$/;

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
            // menuCode 는 메뉴관리 UI 에서 신규 등록 가능하므로 enum 하드코딩 대신 형식만 검증.
            // 존재 여부는 route handler 가 DB 조회(qp_menus) 로 일괄 확인 — 임의 문자열 주입은
            // FK + route 검증 두 단계에서 막힌다.
            menuCode: z
              .string()
              .regex(MENU_CODE_REGEX, "メニューコードの形式が正しくありません"),
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
