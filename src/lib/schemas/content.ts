import { z } from "zod";

import { jstDayStart } from "@/lib/jst-day";

export { idParamSchema } from "@/lib/schemas/common";

// ─── Content ───

/** 비회원 sentinel — URL/JSON 직렬화 불가능한 null 을 FE 에서 안전히 전달하기 위한 마커.
 *  request body·query 양쪽에서 transform 으로 null 로 변환된다. (useTargetLabels.ts 코드 의도) */
export const NON_MEMBER_SENTINEL = "__NON_MEMBER__";

const ROLE_CODE_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;

/** 콘텐츠 목록 ag-grid 헤더 클릭 정렬 대상 필드 — DB 컬럼과 1:1 매핑 가능한 것만 포함.
 *  카테고리/掲示対象 처럼 관계형·집계 렌더링 컬럼은 단순 orderBy 매핑이 불가해 제외. */
export const CONTENT_SORT_FIELDS = [
  "title",
  "createdAt",
  "updatedAt",
  "attachmentCount",
  "authorDepartment",
  "approverLevel",
  "viewCount",
] as const;
export type ContentSortField = (typeof CONTENT_SORT_FIELDS)[number];

/** roleCode 스키マ — string | null 허용 + 비회원 sentinel 변換. 형식 검증 포함. */
const roleCodeWithSentinel = z
  .union([z.string().max(50), z.null()])
  .transform((v) => (v === NON_MEMBER_SENTINEL ? null : v))
  .refine(
    (v) => v === null || ROLE_CODE_FORMAT.test(v),
    { message: "権限コードの形式が正しくありません" },
  );

const contentTargetSchema = z
  .object({
    /** 게시대상 권한코드 — null = 비회원 sentinel (qp_roles 외부, useTargetLabels.ts 코드 의도) */
    roleCode: roleCodeWithSentinel,
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) {
        // JST day 단위 비교 — 같은 날짜 허용, 서버 컨테이너 TZ 비의존
        return jstDayStart(data.startAt) <= jstDayStart(data.endAt);
      }
      return true;
    },
    { message: "開始日は終了日以前に設定してください", path: ["startAt"] },
  );

/** targets 배열 내 roleCode 중복 방어 — DB UNIQUE INDEX는 nullable roleCode 중복을 허용하므로 앱 레이어에서 검증 */
function validateUniqueRoleCodes(
  targets: { roleCode: string | null }[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (!targets) return;
  const seen = new Set<string | null>();
  for (const t of targets) {
    const key = t.roleCode;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "同一の掲載対象が重複しています",
        path: ["targets"],
      });
      return;
    }
    seen.add(key);
  }
}

export const createContentSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(500),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.coerce.date().optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
}).superRefine((data, ctx) => {
  validateUniqueRoleCodes(data.targets, ctx);
});

export const updateContentSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(500).optional(),
  body: z.string().max(100000).optional(),
  status: z.enum(["draft", "published"]).optional(),
  authorDepartment: z.string().max(100).optional(),
  approverLevel: z.number().int().min(0).max(127).optional(),
  targets: z.array(contentTargetSchema).optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
}).superRefine((data, ctx) => {
  validateUniqueRoleCodes(data.targets, ctx);
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
  /** 검색 필터: 게시대상 권한코드 (null = 비회원, 신규 권한 D 도 검색 가능). 비회원은 sentinel `__NON_MEMBER__` 로 전달. */
  roleCode: z
    .string()
    .max(50)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === NON_MEMBER_SENTINEL ? null : v)),
  department: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : undefined)),
  internalOnly: z.coerce.boolean().default(false),
  sort: z.enum(["newest", "oldest", "views", "updated"]).default("newest"),
  /** ag-grid 헤더 클릭 전체 데이터 정렬 — 지정 시 위 sort(프리셋) 대신 이 필드+방향을 사용.
   *  sortCategoryCode/sortTargets 와 상호 배타적(동시 지정 시 validation 오류, 아래 superRefine). */
  sortField: z.enum(CONTENT_SORT_FIELDS).optional(),
  /** 카테고리 컬럼(부모 categoryCode) 헤더 클릭 정렬 — 콘텐츠당 첫 번째(표시순) 자식 카테고리명 기준.
   *  sortField/sortTargets 와 상호 배타적. */
  sortCategoryCode: z.string().min(1).max(50).regex(/^[A-Za-z0-9_]+$/).optional(),
  /** 掲示対象(targets) 컬럼 헤더 클릭 정렬 — 콘텐츠당 표시순 첫 번째 게시대상의 순위(targetOrderRank) 기준.
   *  sortField/sortCategoryCode 와 상호 배타적. */
  // z.coerce.boolean() 은 Boolean("false") === true 로 변환하므로 사용 불가.
  // URL query string "true"/"false" 만 명시적으로 boolean 으로 변환한다.
  sortTargets: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : val),
    z.boolean().optional(),
  ),
  /** sortField/sortCategoryCode/sortTargets 중 하나가 지정된 경우에만 유효 (기본 asc). */
  sortDir: z.enum(["asc", "desc"]).optional(),
}).superRefine((data, ctx) => {
  // 세 정렬 모드는 상호 배타적 — ag-grid 는 클릭된 컬럼 1개의 colId 만 보내므로 정상 흐름에서는
  // 항상 하나만 채워지지만, API 를 직접 호출하는 경우까지 대비해 서버에서도 명시적으로 막는다.
  const sortModes = [
    data.sortField,
    data.sortCategoryCode,
    data.sortTargets === true ? true : undefined,
  ].filter(Boolean);
  if (sortModes.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sortField"],
      message: "sortField、sortCategoryCode、sortTargets は同時に指定できません",
    });
  }
  if (data.sortDir && sortModes.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sortDir"],
      message: "sortDir は sortField・sortCategoryCode・sortTargets のいずれかと併せて指定してください",
    });
  }
});

/**
 * YYYY-MM-DD 형식 + 실제 존재 날짜 검증.
 * regex 만으로는 `2026-02-30`·`2026-13-01` 등 존재하지 않는 날짜가 통과해
 * JS Date 자동 보정(2/30 → 3/2)으로 의도와 다른 범위 쿼리가 실행됨.
 * JST 정오 기준으로 파싱 후 UTC 일자가 원본 문자열과 일치하는지로 실제 존재 여부 확인.
 * 실제 시각 변환은 핸들러에서 jst-day 헬퍼로 별도 수행.
 */
const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません(YYYY-MM-DD)")
  .refine((s) => {
    const d = new Date(`${s}T12:00:00+09:00`);
    return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
  }, "存在しない日付です");

export const downloadLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().max(100).optional(),
    dateFrom: dateOnlyString.optional(),
    dateTo: dateOnlyString.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.dateFrom && val.dateTo && val.dateFrom > val.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "終了日は開始日以降の日付を指定してください",
      });
    }
  });

// ─── Types ───

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type ListContentsQuery = z.infer<typeof listContentsQuerySchema>;
export type DownloadLogsQuery = z.infer<typeof downloadLogsQuerySchema>;
