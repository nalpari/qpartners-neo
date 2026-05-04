import { z } from "zod";

/**
 * menuCode 형식 제약 — DB `qp_menus.menu_code VARCHAR(50)` 과 일치.
 * 영문자(대/소)로 시작 + 영숫자·언더스코어, 50자 이내.
 *
 * # 케이스 정책
 * `createMenuSchema` 는 길이만 검증해 자유 입력 메뉴(`asgas`, `test11` 등) 를 허용한다.
 * 권한 매트릭스 PUT 에서만 strict 대문자 regex 로 거부하면 신규 역할에 기존 메뉴 권한을
 * 부여하지 못하는 비대칭이 발생하므로, 본 regex 는 menu 생성과 동일한 케이스 포용 정책으로
 * 완화 — 실 보안 가드는 route handler 의 DB 존재성 검증(`qp_menus`).
 *
 * 보안: lockout 가드는 `restrictedMenuCodeSet` (ADM_PERMISSION / ADM_MENU / ADM_CODE) 의
 * 값-기반 `.has()` 비교로 판정하므로, 임의 문자열 주입 공격이 이 3종과 정확히 일치하지
 * 않는 한 우회 불가. RESTRICTED 식별은 enum 이 아니라 Set 이 단일 진실 원천.
 */
const MENU_CODE_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;

/**
 * roleCode 형식 제약 — DB `qp_roles.role_code` 와 일치.
 * 대문자 + 숫자 + 언더스코어, 영문자로 시작 (예: `SUPER_ADMIN`, `1ST_STORE`).
 * 단, 첫글자 대문자 제약은 시드의 `1ST_STORE` / `2ND_STORE` (숫자 시작) 를 허용해야 하므로
 * 영숫자 시작으로 완화. 50자 이내.
 *
 * 신규 역할 등록 시 enum 고정을 풀어 사용자 정의 코드(`MANAGER`, `STAFF` 등) 추가 가능.
 *
 * # 운영 주의
 * - QSP 가 발급하는 인증 헤더(X-User-Role) 는 표준 6개(`authRoleValues`) 만 인식.
 *   `lib/auth.ts:VALID_ROLES` 가 6개 enum 으로 헤더 검증 → 임의 roleCode 를 사용자에게
 *   부여하려면 QSP 측 코드 발급 + `VALID_ROLES` 확장이 별도로 필요.
 * - 본 변경은 qp_roles 테이블에 임의 권한 row 를 추가/관리할 수 있게 해주는 데이터 레이어
 *   확장이며, 실 사용자 인증/권한 매핑까지 즉시 풀리는 것은 아님.
 */
const ROLE_CODE_REGEX = /^[A-Z0-9][A-Z0-9_]{0,49}$/;

// ─── Role ───

/** roleCode path parameter 검증 — 형식만 체크, 존재 여부는 route handler 가 DB 조회로 확인. */
export const roleCodeParamSchema = z
  .string()
  .max(50, "roleCodeが長すぎます")
  .regex(ROLE_CODE_REGEX, "roleCodeの形式が正しくありません");

/** 신규 역할 등록 — roleCode 는 형식 검증만, 임의 사용자 정의 코드 허용. */
export const createRoleSchema = z.object({
  roleCode: z
    .string()
    .max(50, "roleCodeが長すぎます")
    .regex(ROLE_CODE_REGEX, "roleCodeの形式が正しくありません"),
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
            // `.max(50)` 은 정규식이 이미 50자 강제하지만, 향후 정규식만 완화될 때도 길이 제약이
            // 남도록 Defense in Depth 로 병행.
            menuCode: z
              .string()
              .max(50, "メニューコードが長すぎます")
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
