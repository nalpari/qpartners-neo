import { z } from "zod";

// ─── QSP statCd ↔ TO-BE status 매핑 (공용) ───

/** QSP statCd → TO-BE status (사양서 기준: A=정상, D=삭제, R=탈퇴) */
export const STAT_CD_TO_STATUS = {
  A: "active",
  D: "deleted",
  R: "withdrawn",
} as const;

export type QspStatCd = keyof typeof STAT_CD_TO_STATUS;
export type MemberStatus = (typeof STAT_CD_TO_STATUS)[QspStatCd];

/**
 * 수정 가능한 상태값 (withdrawn は読み取り専用のため除外).
 * SSoT — `memberUpdateSchema.status` 의 enum 도 이 배열을 참조해 동기화된다.
 */
export const WRITABLE_STATUSES = ["active", "deleted"] as const;
export type WritableStatus = (typeof WRITABLE_STATUSES)[number];

/**
 * TO-BE status → QSP statCd (수정 가능한 상태만).
 * 키 집합이 `WritableStatus` 로 고정되어 있어 `memberUpdateSchema.status` 확장 시
 * 여기 매핑도 컴파일 타임에 강제 갱신된다 (SSoT 보장).
 */
export const STATUS_TO_STAT_CD: Record<WritableStatus, QspStatCd> = {
  active: "A",
  deleted: "D",
};

/** 목록 필터용: withdrawn 포함 전체 매핑 */
export const STATUS_FILTER_TO_STAT_CD: Record<MemberStatus, QspStatCd> = {
  active: "A",
  deleted: "D",
  withdrawn: "R",
};

/** QSP userTp → 화면표시 회원유형 레이블 (hardcoded fallback)
 *  MF-3: 관리자 회원관리 화면에서는 시공점(SEKO)을 관리 대상에서 제외하지만,
 *  QSP 응답에 SEKO 가 포함되어 상세/목록에 노출되는 경우를 대비해 레이블을 정의해 둔다.
 *  (미정의 시 "unknown" 으로 표시되어 운영상 추적이 어려움)
 *
 *  본 객체는 DB(코드관리 USER_TYPE) 미등록·조회 실패 시 fallback. 정상 경로는
 *  `getUserTypeLabelMap()` 가 코드관리 디테일을 조회해 제공한다.
 */
export const USER_TYPE_LABEL = {
  ADMIN: "管理者",
  STORE: "販売店",
  SEKO: "施工店",
  GENERAL: "一般",
} as const;

/** 안전한 lookup — `as` 캐스팅 없이 타입 가드로 좁혀서 매핑 객체에 접근 */
function isQspStatCd(key: string): key is QspStatCd {
  return key in STAT_CD_TO_STATUS;
}

export function lookupStatCd(key: string | null): MemberStatus | undefined {
  if (key === null) return undefined;
  if (!isQspStatCd(key)) {
    console.warn("[lookupStatCd] 매핑되지 않는 statCd:", key);
    return undefined;
  }
  return STAT_CD_TO_STATUS[key];
}

type UserTypeKey = keyof typeof USER_TYPE_LABEL;
function isUserTypeKey(key: string): key is UserTypeKey {
  return key in USER_TYPE_LABEL;
}

export function lookupUserTypeLabel(key: string | null): string | undefined {
  if (key === null) return undefined;
  if (!isUserTypeKey(key)) {
    console.warn("[lookupUserTypeLabel] 매핑되지 않는 userTp:", key);
    return undefined;
  }
  return USER_TYPE_LABEL[key];
}

// ─── 회원 목록 쿼리 파라미터 ───

/** 회원 목록 필터용 상태값 */
const memberStatusValues = ["active", "deleted", "withdrawn"] as const;
/** 회원 목록 필터용 유형값
 *  시공점(SEKO)은 별도 관리 화면에서 다루므로 본 관리자 회원관리 필터에서는 의도적으로 제외.
 *  (표시 레이블은 USER_TYPE_LABEL 에 SEKO 를 포함하여 방어적으로 대응)
 */
const memberTypeValues = ["ADMIN", "STORE", "GENERAL"] as const;

// 공백-only 입력을 undefined 로 정규화 — FE bypass 시 "   " 가 QSP 로 넘어가 무의미 쿼리 유발 차단.
const searchString = (fieldMsg: string) =>
  z.string().max(200, fieldMsg).optional().transform((v) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
  });

export const memberListQuerySchema = z.object({
  // 길이 제한: QSP DoS 방지 (긴 문자열로 외부 API 부하 방지).
  // ID/氏名/Email/会社名 각각 개별 파라미터 — QSP userListMng 에 동일 필드명으로 매핑.
  userId: searchString("IDが長すぎます"),
  userName: searchString("氏名が長すぎます"),
  email: searchString("メールアドレスが長すぎます"),
  companyName: searchString("会社名が長すぎます"),
  userType: z.enum(memberTypeValues).optional(),
  status: z.enum(memberStatusValues).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

// ─── userTp → authCd 기본값 매핑 ───

/**
 * preDetail 없는 삭제/탈퇴 회원 수정 시 authCd fallback 값을 결정한다.
 * STORE는 1ST_STORE/2ND_STORE 구분이 불가하므로 매핑 불가(null).
 */
const USER_TP_TO_DEFAULT_AUTH_CD: Record<string, string | null> = {
  GENERAL: "GENERAL",
  ADMIN: "ADMIN",
  SEKO: "SEKO",
  STORE: null, // 1ST_STORE/2ND_STORE 구분 불가
};

export function defaultAuthCdFromUserTp(userTp: string): string | null {
  return USER_TP_TO_DEFAULT_AUTH_CD[userTp] ?? null;
}

// ─── authCd → userRole 정규화 ───

/** 알려진(매핑/통과 정책 합의된) authCd 집합. 새 값 발견 시 운영 가시성 확보를 위해 warn.
 *  NOTE: "NORMAL" 은 normalizeAuthCdToUserRole 에서 "GENERAL" 로 먼저 분기되어
 *        Set 체크에 도달하지 않으므로 의도적으로 미포함. */
const KNOWN_AUTH_CD_VALUES = new Set([
  "ADMIN",
  "SUPER_ADMIN",
  "1ST_STORE",
  "2ND_STORE",
  "GENERAL",
  "SEKO",
]);

/**
 * QSP authCd 를 프론트 userRole enum 으로 정규화.
 *
 * QSP 는 신규 일반회원 가입 시 `authCd: "NORMAL"` 을 발급(signup 라우트에서 명시 전송)하지만,
 * 프론트 `ROLE_OPTIONS_GENERAL` enum 은 "GENERAL" 을 사용한다. 매핑 없이 "NORMAL" 을 그대로
 * 내려보내면 회원 상세 팝업에서 SelectBox 옵션과 불일치 → TextValue fallback → 권한 수정 불가.
 *
 * 매핑 정책:
 *   - "NORMAL" → "GENERAL" (QSP 일반회원 기본값 정규화)
 *   - 그 외 값(ADMIN, 1ST_STORE, 2ND_STORE, SEKO 등) 은 그대로 통과 (의도적 passthrough)
 *   - null/undefined/"" → "" (기존 동작 유지 — 정보 없음)
 *
 * 의도적 passthrough 인 이유:
 *   QSP 가 추후 새로운 표준 권한 코드(예: "VIEWER", "AUDITOR")를 추가할 때, 정규화 함수가
 *   "UNKNOWN" 으로 일괄 마스킹하면 운영자가 권한 코드 신설 사실 자체를 인지할 수 없어
 *   매핑 정책 업데이트 누락이 발생한다. 따라서 미지 값은 노출 + warn 로그 조합으로
 *   "운영자에게 알린 뒤 그대로 통과" 하여, FE SelectBox 가 fallback TextValue 로 표시 →
 *   운영팀이 즉시 매핑 추가를 진행하는 흐름을 유지한다.
 *
 * 보안 측면 — 이 함수가 받는 authCd 는 이미 백엔드 → QSP → 백엔드 경유로 검증된 회원관리
 * 응답 페이로드 일부이며, 자유 입력 사용자 입력이 아니므로 임의 문자열 노출 위험은 없다.
 * 다만 새 권한 코드 누락은 권한 부여 UX 결함으로 이어지므로 console.warn 으로 가시성 확보.
 *
 * KNOWN_AUTH_CD_VALUES 갱신 절차:
 *   warn 로그 발견 → QSP 권한 코드 사양서 확인 → KNOWN_AUTH_CD_VALUES + ROLE_OPTIONS_*
 *   동시 갱신 → 필요 시 매핑 분기 추가.
 */
/** authCd 길이 상한. KNOWN 권한 코드 최대 길이("SUPER_ADMIN"=11)의 ~3배 여유.
 *  Defence in Depth — QSP 응답이 신뢰 범위이고 React 텍스트 렌더링이 자동 이스케이프하므로
 *  XSS 위험은 낮으나, 비정상적으로 긴 문자열 노출을 사전 차단한다. */
const AUTH_CD_MAX_LENGTH = 32;

export function normalizeAuthCdToUserRole(
  authCd: string | null | undefined,
): string {
  if (!authCd) return "";
  if (authCd === "NORMAL") return "GENERAL";
  if (authCd.length > AUTH_CD_MAX_LENGTH) {
    console.warn(
      "[normalizeAuthCdToUserRole] authCd 길이 상한 초과 — 빈 값으로 폴백:",
      { length: authCd.length, max: AUTH_CD_MAX_LENGTH },
    );
    return "";
  }
  if (!KNOWN_AUTH_CD_VALUES.has(authCd)) {
    console.warn(
      "[normalizeAuthCdToUserRole] 알 수 없는 authCd — 매핑 정책 검토 필요:",
      authCd,
    );
  }
  return authCd;
}

/**
 * authCd 누락 회원의 userRole 폴백 — userTp + storeLvl 기반.
 *
 * QSP 응답에서 authCd 가 빈 값으로 도착하는 회원이 존재 (TODO: BE 정합성 추적 대상).
 * normalizeAuthCdToUserRole 가 빈 문자열을 반환할 때, 회원 상세 화면의 ユーザー権限 셀이
 * "-" 로만 표시되어 운영자가 권한 식별 불가.
 *
 * 매핑 정책 — `resolveAuthRole` (login/auto-login) 과 동일 (SSoT):
 *   - ADMIN  → "ADMIN"  (SUPER_ADMIN 정확도 필요한 경로는 별도 ADMIN_ROLE 코드 조회 사용)
 *   - STORE  → storeLvl=="1" → "1ST_STORE", 그 외 → "2ND_STORE" (최소 권한 폴백)
 *   - SEKO   → "SEKO"
 *   - GENERAL → "GENERAL"
 *   - 기타/null → "" (호출측이 "-" 표시)
 *
 * 보안 — 본 함수는 표시(display) 용 폴백이며 권한 부여 결정에 사용하지 않는다.
 * 권한 결정 경로는 JWT/QSP 의 authCd 직접 사용, 매트릭스 기반 가드를 거친다.
 */
export function fallbackUserRoleFromUserTp(
  userTp: string | null | undefined,
  storeLvl: string | null | undefined,
): string {
  switch (userTp) {
    case "ADMIN":
      return "ADMIN";
    case "STORE":
      return storeLvl === "1" ? "1ST_STORE" : "2ND_STORE";
    case "SEKO":
      return "SEKO";
    case "GENERAL":
      return "GENERAL";
    default:
      return "";
  }
}

// ─── 회원 수정 요청 ───

/**
 * 회원 수정 요청 스키마.
 *
 * userRole 은 권한관리(qp_roles) 테이블의 동적 데이터로 검증한다 (Redmine #2178):
 *   - 빈 문자열은 정규식으로 차단
 *   - 실제 활성·SUPER_ADMIN/ADMIN 외 검증은 라우트에서 prisma.qpRole 조회로 수행
 *
 * ※ enum 필드(newsRcptYn, status)는 빈 문자열이 입력값으로 통과되지 않는다.
 * ※ boolean 필드는 `.optional()` 로 `undefined` 판별 가능 — route.ts 에서 `!== undefined`
 *   검사로 `false` 를 정상 처리(??로 쓰면 false 가 폴백으로 빠짐).
 * ※ `status` 의 enum 은 `WRITABLE_STATUSES` 를 참조해 `STATUS_TO_STAT_CD` 와 SSoT 동기.
 */
export const memberUpdateSchema = z.object({
  userRole: z.string().min(1, "userRole は必須です").max(50).optional(),
  twoFactorEnabled: z.boolean().optional(),
  loginNotification: z.boolean().optional(),
  attributeChangeNotification: z.boolean().optional(),
  status: z.enum(WRITABLE_STATUSES).optional(),
  newsRcptYn: z.enum(["Y", "N"]).optional(),
});

export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

// ─── QSP 공용 응답 구조 ───

const qspResultSchema = z.object({
  code: z.number(),
  resultCode: z.string(),
  message: z.string(),
  resultMsg: z.string(),
});

// ─── QSP 회원 목록 응답 ───

const qspMemberItemSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  email: z.string().nullable(),
  userTp: z.string().nullable(),
  userTpNm: z.string().nullable(),
  compNm: z.string().nullable(),
  statCd: z.string().nullable(),
  statNm: z.string().nullable(),
  loginDt: z.string().nullable(),
  regDt: z.string().nullable(),
  storeLvl: z.string().nullable().optional(),
  newsRcptYn: z.enum(["Y", "N"]).nullable().optional(),
});

export type QspMemberItem = z.infer<typeof qspMemberItemSchema>;

export const qspMemberListResponseSchema = z.object({
  data: z.object({
    totCnt: z.number().nullable().transform(v => v ?? 0),
    list: z.array(qspMemberItemSchema).nullable(),
  }).nullable(),
  result: qspResultSchema,
});

export type QspMemberListResponse = z.infer<typeof qspMemberListResponseSchema>;

// ─── QSP 회원 상세 응답 ───

/** QSP 유저 정보 조회 응답 (사양서 No.13 userDetail — /api/qpartners/user/detail) */
const qspMemberDetailSchema = z.object({
  userId: z.string(),
  userTp: z.string().nullable(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  user1stNm: z.string().nullable(),
  user2ndNm: z.string().nullable(),
  user1stNmKana: z.string().nullable(),
  user2ndNmKana: z.string().nullable(),
  email: z.string().nullable(),
  authCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  compPostCd: z.string().nullable(),
  compAddr: z.string().nullable(),
  compAddr2: z.string().nullable(),
  compTelNo: z.string().nullable(),
  compFaxNo: z.string().nullable(),
  compCd: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  statCd: z.string().nullable(),
  secAuthYn: z.enum(["Y", "N"]).nullable(),
  loginNotiYn: z.enum(["Y", "N"]).nullable(),
  attrChgYn: z.enum(["Y", "N"]).nullable(),
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
  pwdChgDt: z.string().nullable(),
  pwdInitYn: z.string().nullable(),
  storeLvl: z.string().nullable(),
  /** 등록일 — QSP 응답 포맷 "YYYY.MM.DD" (시각 없음) */
  regDt: z.string().nullable().optional(),
  /** 갱신일 — QSP 응답 포맷 "YYYY.MM.DD HH:mm:ss" */
  uptDt: z.string().nullable().optional(),
  /** 갱신자 성명 (userNm 형태, userId 아님) */
  uptNm: z.string().nullable().optional(),
  /** 뉴스알림 변경일시 — "YYYY.MM.DD HH:mm:ss". QSP 신규 추가(2026-04-24).
   *  마이페이지 뉴스레터 수신일시 표시 용도. 기존 `newsRcptDate` 는 더 이상 사용 안 됨. */
  newsRcptChgDt: z.string().nullish(),
  /** 최종 로그인일시 — "YYYY.MM.DD HH:mm:ss". 회원관리 상세 "최근 접속일" 표시 용도. */
  loginDt: z.string().nullish(),
  /** 탈퇴일시 — "YYYY.MM.DD HH:mm:ss". 회원관리 상세 표시 용도.
   *  탈퇴(statCd=R) 회원에 한해 채워짐. */
  resignDt: z.string().nullish(),
  /** 탈퇴사유 — 최대 500자 (saveResignReq 입력 상한과 일치). 회원관리 상세 표시 용도.
   *  QSP 가 제한을 초과한 값을 반환하더라도 응답 단계에서 차단 → 502 로 폴백. */
  resignRemark: z.string().max(500).nullish(),
  /** 법인번호 — GENERAL 회원의 마이페이지 수정 대상 필드.
   *  속성 변경 알림(attr-change-mail.ts)에서 변경 전/후 비교에 사용. */
  corporateNo: z.string().nullish(),
});

export const qspMemberDetailResponseSchema = z.object({
  data: qspMemberDetailSchema.nullable(),
  result: qspResultSchema,
});

export type QspMemberDetailResponse = z.infer<typeof qspMemberDetailResponseSchema>;

// ─── QSP 회원 수정 응답 (공용 구조) ───

export const qspUpdateResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: qspResultSchema,
});

// ─── 회원 ID 파라미터 (userId=이메일 문자열) ───

// 길이 제한: DB VarChar(255) 초과로 인한 truncation/에러 방지
export const memberIdParamSchema = z
  .string()
  .min(1, "IDは必須です")
  .max(255, "IDが長すぎます");
