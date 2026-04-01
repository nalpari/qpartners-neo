# 권한 관리 API Design Document

> **Summary**: Role 목록 + 메뉴별 CRUD 권한 설정 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-22
> **Status**: Draft
> **Planning Doc**: [permission.plan.md](../../01-plan/features/permission.plan.md)

---

## 1. Data Model (Prisma — 기존)

```
QpRole (qp_roles)
├── id: Int (PK, auto)
├── roleCode: String (unique, 50) — 수정 불가
├── roleName: String (100)
├── description: String? (500)
├── isActive: Boolean (default: true)
├── createdAt / createdBy / updatedAt / updatedBy
└── permissions: QpRoleMenuPermission[]

QpRoleMenuPermission (qp_role_menu_permissions)
├── id: Int (PK, auto)
├── roleCode: String (50, FK → QpRole.roleCode)
├── menuCode: String (50, FK → Menu.menuCode)
├── canRead: Boolean (default: false)
├── canCreate: Boolean (default: false)
├── canUpdate: Boolean (default: false)
├── canDelete: Boolean (default: false)
├── createdAt / createdBy / updatedAt / updatedBy
└── @@id([roleCode, menuCode])  — 복합 PK
```

---

## 2. API Specification

### `GET /api/roles` — 권한 목록

**Query:** `activeOnly` (boolean, default: true)

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "roleCode": "SuperADMIN",
      "roleName": "슈퍼관리자",
      "description": "사내직원, 전체 메뉴 CRUD 권한 부여",
      "isActive": true
    }
  ]
}
```

### `POST /api/roles` — 권한 추가

**Request Body:**
```json
{
  "roleCode": "Cus6",
  "roleName": "특수회원",
  "description": "특수 파트너사",
  "isActive": true
}
```

**중복 체크:** roleCode unique → 409

### `PUT /api/roles/[roleCode]` — 권한 수정

**수정 불가:** `roleCode`
**수정 가능:** `roleName`, `description`, `isActive`

### `GET /api/roles/[roleCode]/permissions` — 메뉴별 권한 조회

**비즈니스 로직:**
- 전체 메뉴(2레벨) 목록 + 해당 roleCode의 CRUD 권한 매핑
- 메뉴에 pageUrl이 있으면 Y 표시

**Response (200):**
```json
{
  "data": {
    "roleCode": "ADMIN",
    "roleName": "관리자",
    "menus": [
      {
        "menuCode": "SEARCH",
        "menuName": "통합검색",
        "level": 1,
        "hasUrl": true,
        "canRead": true,
        "canCreate": true,
        "canUpdate": true,
        "canDelete": true,
        "children": [...]
      }
    ]
  }
}
```

### `PUT /api/roles/[roleCode]/permissions` — 메뉴별 권한 일괄 저장

**Request Body:**
```json
{
  "permissions": [
    { "menuCode": "SEARCH", "canRead": true, "canCreate": true, "canUpdate": true, "canDelete": true },
    { "menuCode": "CONTENT", "canRead": true, "canCreate": false, "canUpdate": false, "canDelete": false }
  ]
}
```

**비즈니스 로직:**
- 기존 권한 전부 삭제 후 새로 생성 (replace)
- 트랜잭션 처리

---

## 3. Zod Schemas

파일: `src/lib/schemas/permission.ts`

```typescript
export const createRoleSchema = z.object({
  roleCode: z.string().min(1).max(50),
  roleName: z.string().min(1).max(100),
  description: z.string().max(500).nullable().default(null),
  isActive: z.boolean().default(true),
})

export const updateRoleSchema = z.object({
  roleName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.object({
    menuCode: z.string().min(1).max(50),
    canRead: z.boolean().default(false),
    canCreate: z.boolean().default(false),
    canUpdate: z.boolean().default(false),
    canDelete: z.boolean().default(false),
  })).min(1),
})
```

---

## 4. File Structure

```
src/app/api/roles/
├── route.ts                        # GET (목록), POST (추가)
└── [roleCode]/
    ├── route.ts                    # PUT (수정)
    └── permissions/
        └── route.ts                # GET (권한 조회), PUT (권한 일괄 저장)
src/lib/schemas/
└── permission.ts
```

---

## 5. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | Zod 스키마 | `src/lib/schemas/permission.ts` |
| 2 | Role 목록 + 추가 | `src/app/api/roles/route.ts` |
| 3 | Role 수정 | `src/app/api/roles/[roleCode]/route.ts` |
| 4 | 권한 조회 + 일괄 저장 | `src/app/api/roles/[roleCode]/permissions/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-22 | Initial draft | CK |
| 0.2 | 2026-03-30 | Data Model createdBy/updatedBy 추가, QpRoleMenuPermission PK 수정 (@@id 복합키) | CK |
