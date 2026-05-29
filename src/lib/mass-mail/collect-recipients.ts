/**
 * 대량메일 발송대상 이메일 수집
 *
 * QSP 회원관리 목록 API(userListMng)를 페이징 호출하여 발송대상 이메일을 수집한다.
 * - storeLvl / newsRcptYn 을 목록에서 직접 받아 필터링
 * - email 기준 중복 제거
 * - 시공점(SEKO)은 AS-IS API 미확보로 1차 제외
 *
 * Target Dynamic from Role (2026-05-07):
 * - boolean 6개 → targetRoleCodes 배열 (qp_roles.roleCode)
 * - RecipientAuthRole enum → String snapshot (FK 없음)
 *
 * 운영자 정의 추가 권한 발송 (2026-05-29):
 * - 커스텀 권한은 GENERAL userTp 회원에게만 authCd 로 부여됨 (회원관리 정책).
 * - userListMng 응답에는 authCd 가 없으므로 GENERAL 회원의 userDetail 을
 *   chunk 병렬 호출하여 authCd 를 보강한 뒤 effective role 매칭.
 * - userDetail 호출 실패는 skip + stats 카운트로 추적.
 *
 * Plan: mass-mail-send.plan.md §5
 * Design: mass-mail-send.design.md §2
 */

import { resolveActiveRoleCodes } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS, MASS_MAIL_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import { fetchQspUserDetail } from "@/lib/qsp-member";
import { SYSTEM_ROLE_CODES } from "@/lib/schemas/common";
import { qspMemberListResponseSchema, lookupStatCd } from "@/lib/schemas/member";

/** GENERAL userDetail 보강 시 chunk 당 병렬 호출 수 — QSP 부하 제한 */
const AUTH_CD_LOOKUP_CHUNK = 8;

/** SUPER_ADMIN/ADMIN 격상 차단용 — resolveAuthRole(auth.ts) 와 동일 정책 */
const ADMIN_ROLE_CODES: ReadonlySet<string> = new Set(["SUPER_ADMIN", "ADMIN"]);

export interface CollectTargets {
  /** 발송대상 권한코드 배열 — qp_roles FK */
  roleCodes: string[];
  /** true: 뉴스레터 수신거부 회원도 포함, false: 제외 */
  optOut: boolean;
}

export interface CollectedRecipient {
  email: string;
  userName: string | null;
  /** 발송 시점 권한 코드 snapshot — qp_roles.roleCode */
  authRoleCode: string;
}

interface QspMemberItem {
  userId: string;
  userNm: string | null;
  email: string | null;
  userTp: string | null;
  statCd: string | null;
  storeLvl?: string | null;
  newsRcptYn?: "Y" | "N" | null;
}

interface CollectionContext {
  targets: CollectTargets;
  callerRoute: string;
  loginId: string;
}

/**
 * ADMIN userTp 회원의 SUPER_ADMIN 여부 일괄 조회.
 *
 * 판정 기준은 로그인 시 `resolveAuthRole`(`src/lib/auth.ts`) 와 동일.
 */
async function fetchSuperAdminIds(adminUserIds: string[]): Promise<Set<string>> {
  if (adminUserIds.length === 0) return new Set();
  const rows = await prisma.codeDetail.findMany({
    where: {
      header: { headerCode: "ADMIN_ROLE", isActive: true },
      code: { in: adminUserIds },
      isActive: true,
    },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

/** SEKO 미지원 가드 — 라우트에서 사전 차단되지만 방어적으로 throw */
export class SekoNotSupportedError extends Error {
  constructor() {
    super("SEKO_NOT_SUPPORTED");
    this.name = "SekoNotSupportedError";
  }
}

/**
 * roleCode 배열 → QSP userTp 조회 대상 + 커스텀 권한 추출.
 * 커스텀 권한은 항상 GENERAL userTp 회원에게만 부여되므로 (회원관리 정책)
 * 커스텀 권한이 targets 에 있으면 GENERAL 을 query 대상에 강제 포함.
 */
function resolveUserTypesToQuery(targets: CollectTargets): {
  userTypes: string[];
  customRoles: string[];
} {
  // SEKO 미지원 — 사전 차단
  if (targets.roleCodes.includes("SEKO")) {
    console.error(
      "[collect-recipients] 시공점(SEKO) 발송 대상 선택됨 — AS-IS API 미확보로 미지원 (라우트 단계 검증 누락 가능성)",
    );
    throw new SekoNotSupportedError();
  }

  const customRoles = targets.roleCodes.filter((c) => !SYSTEM_ROLE_CODES.has(c));

  const userTypes = new Set<string>();
  for (const code of targets.roleCodes) {
    if (code === "SUPER_ADMIN" || code === "ADMIN") userTypes.add("ADMIN");
    else if (code === "1ST_STORE" || code === "2ND_STORE") userTypes.add("STORE");
    else if (code === "GENERAL") userTypes.add("GENERAL");
  }
  // 커스텀 권한은 GENERAL userTp 위에 부여되므로 GENERAL 회원목록을 강제 조회
  if (customRoles.length > 0) userTypes.add("GENERAL");

  return { userTypes: Array.from(userTypes), customRoles };
}

/**
 * RFC 5321 기본 형식 + CRLF 차단 검증.
 */
const EMAIL_BASIC_RE = /^[^\s<>"'\r\n]+@[^\s<>"'\r\n]+\.[^\s<>"'\r\n]+$/;
function isSafeEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (/[\r\n]/.test(email)) return false;
  return EMAIL_BASIC_RE.test(email);
}

interface RecipientStats {
  adminUserIdNull: number;
  invalidEmail: number;
  newsRcptOptOut: number;
  superAdminOnlyExcluded: number;
  /** GENERAL 회원 authCd 보강 실패(userDetail 비정상/네트워크 등) — 해당 회원은 skip */
  authCdLookupFailed: number;
}

/**
 * GENERAL 회원의 authCd 보강.
 * - userListMng 응답에 authCd 가 없어 effective role(authCd) 매칭이 불가능하므로
 *   userDetail 을 chunk 병렬 호출하여 보강.
 * - 호출 실패는 null + stats 카운트 — 해당 회원은 매핑 시 effective role 결정 불가로 skip.
 *
 * @returns Map<userId, authCd | null>
 */
async function fetchAuthCdMap(
  userIds: readonly string[],
  callerRoute: string,
  loginId: string,
  stats: RecipientStats,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (let i = 0; i < userIds.length; i += AUTH_CD_LOOKUP_CHUNK) {
    const chunk = userIds.slice(i, i + AUTH_CD_LOOKUP_CHUNK);
    const settled = await Promise.allSettled(
      chunk.map((uid) =>
        fetchQspUserDetail(uid, "GENERAL", callerRoute, loginId),
      ),
    );
    for (let j = 0; j < chunk.length; j++) {
      const uid = chunk[j];
      const r = settled[j];
      if (r.status === "fulfilled" && r.value.ok) {
        result.set(uid, r.value.detail.authCd ?? null);
      } else {
        stats.authCdLookupFailed++;
        result.set(uid, null);
      }
    }
  }
  return result;
}

/**
 * QSP 응답 아이템 → 필터 + authRoleCode 매핑 결정. null 반환 시 제외.
 *
 * GENERAL 분기는 authCdMap 이 주어진 경우 effective role(=authCd 우선) 정확 계산.
 * authCdMap 이 null 이면 기존 동작(=무조건 GENERAL 로 매칭) 유지 — 커스텀 권한 targets 가
 * 없는 경우 N+1 호출 비용을 피하기 위한 분기 (resolveAuthRole 와의 미세 불일치는 trade-off).
 */
function mapRecipient(
  item: QspMemberItem,
  targets: CollectTargets,
  superAdminIds: Set<string>,
  activeRoleCodes: ReadonlySet<string>,
  authCdMap: ReadonlyMap<string, string | null> | null,
  stats: RecipientStats,
): CollectedRecipient | null {
  if (lookupStatCd(item.statCd) !== "active") return null;

  const email = item.email?.trim();
  if (!email || !isSafeEmail(email)) {
    if (email) stats.invalidEmail++;
    return null;
  }

  if (!targets.optOut && item.newsRcptYn === "N") {
    stats.newsRcptOptOut++;
    return null;
  }

  const targetRoleCodes = new Set(targets.roleCodes);

  let authRoleCode: string | null = null;
  switch (item.userTp) {
    case "ADMIN": {
      if (!item.userId) stats.adminUserIdNull++;
      const isSuper = item.userId ? superAdminIds.has(item.userId) : false;
      if (isSuper && targetRoleCodes.has("SUPER_ADMIN")) {
        authRoleCode = "SUPER_ADMIN";
      } else if (!isSuper && targetRoleCodes.has("ADMIN")) {
        authRoleCode = "ADMIN";
      } else if (!isSuper && targetRoleCodes.has("SUPER_ADMIN") && !targetRoleCodes.has("ADMIN")) {
        stats.superAdminOnlyExcluded++;
      }
      break;
    }
    case "STORE":
      if (item.storeLvl === "1" && targetRoleCodes.has("1ST_STORE")) {
        authRoleCode = "1ST_STORE";
      } else if (item.storeLvl === "2" && targetRoleCodes.has("2ND_STORE")) {
        authRoleCode = "2ND_STORE";
      }
      break;
    case "GENERAL": {
      // authCdMap 이 있으면 resolveAuthRole 와 동일 정책으로 effective role 정확 계산.
      // 없으면(=커스텀 targets 없음) 기존 동작 유지 — userTp=GENERAL 회원은 모두 GENERAL 매칭.
      let effectiveRole = "GENERAL";
      if (authCdMap) {
        const authCd = authCdMap.get(item.userId) ?? null;
        if (authCd && activeRoleCodes.has(authCd) && !ADMIN_ROLE_CODES.has(authCd)) {
          effectiveRole = authCd;
        }
      }
      if (targetRoleCodes.has(effectiveRole)) authRoleCode = effectiveRole;
      break;
    }
  }

  if (authRoleCode === null) return null;

  return {
    email,
    userName: item.userNm,
    authRoleCode,
  };
}

/** 단일 userTp 에 대해 페이징 반복 호출하여 전체 목록 취득 */
async function fetchAllByUserType(
  userTp: string,
  context: CollectionContext,
): Promise<QspMemberItem[]> {
  const { pageSize, maxPages } = MASS_MAIL_DEFAULTS;
  const collected: QspMemberItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;

    const params = new URLSearchParams({
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      loginId: context.loginId,
      startRow: String(startRow),
      endRow: String(endRow),
      userTp,
    });

    const response = await fetchWithLog(
      `${QSP_API.userListMng}?${params.toString()}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userListMng",
        callerRoute: context.callerRoute,
        userId: maskEmail(context.loginId),
        userType: "ADMIN",
      },
    );

    if (!response.ok) {
      throw new Error(`QSP userListMng 응답 비정상: ${response.status} (userTp=${userTp})`);
    }

    const body: unknown = await response.json();
    const parsed = qspMemberListResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`QSP userListMng 응답 스키마 불일치 (userTp=${userTp}): ${parsed.error.message}`);
    }
    if (parsed.data.result.resultCode !== "S") {
      throw new Error(`QSP userListMng 조회 실패 (userTp=${userTp}): ${parsed.data.result.message}`);
    }

    const data = parsed.data.data;
    if (!data) break;
    const { list, totCnt } = data;
    if (list && list.length > 0) {
      collected.push(...list);
    }

    if (!list || list.length === 0 || collected.length >= totCnt) break;

    if (page === maxPages) {
      console.warn(
        `[collect-recipients] MAX_PAGES 도달 (userTp=${userTp}, totCnt=${totCnt}, collected=${collected.length})`,
      );
    }
  }

  return collected;
}

/**
 * 발송대상별 이메일 수집.
 */
export async function collectRecipients(
  targets: CollectTargets,
  callerRoute: string,
  loginId: string,
): Promise<CollectedRecipient[]> {
  const { userTypes, customRoles } = resolveUserTypesToQuery(targets);
  if (userTypes.length === 0) return [];

  const context: CollectionContext = { targets, callerRoute, loginId };
  const dedupedByEmail = new Map<string, CollectedRecipient>();
  const stats: RecipientStats = {
    adminUserIdNull: 0,
    invalidEmail: 0,
    newsRcptOptOut: 0,
    superAdminOnlyExcluded: 0,
    authCdLookupFailed: 0,
  };

  const fetchedByUserType = new Map<string, QspMemberItem[]>();
  for (const userTp of userTypes) {
    fetchedByUserType.set(userTp, await fetchAllByUserType(userTp, context));
  }

  const adminItems = fetchedByUserType.get("ADMIN") ?? [];
  const adminUserIds = adminItems
    .filter((i) => lookupStatCd(i.statCd) === "active" && i.userId)
    .map((i) => i.userId);
  const superAdminIds = await fetchSuperAdminIds(adminUserIds);
  if (adminUserIds.length > 0) {
    console.log(
      `[collect-recipients] SUPER_ADMIN 판정 완료 — ADMIN 회원 ${adminUserIds.length}명 중 SUPER_ADMIN ${superAdminIds.size}명`,
    );
  }

  // 커스텀 권한 발송 시에만 GENERAL 회원의 authCd 를 userDetail 로 보강 (chunk 병렬).
  // 6 기본 권한만 발송하는 경우 보강 skip — N+1 호출 비용을 피하고 기존 동작 유지.
  let authCdMap: Map<string, string | null> | null = null;
  let activeRoleCodes: ReadonlySet<string> = new Set<string>();
  if (customRoles.length > 0) {
    activeRoleCodes = await resolveActiveRoleCodes();
    const generalItems = fetchedByUserType.get("GENERAL") ?? [];
    const generalActiveIds = generalItems
      .filter((i) => lookupStatCd(i.statCd) === "active" && i.userId)
      .map((i) => i.userId);
    authCdMap = await fetchAuthCdMap(
      generalActiveIds,
      callerRoute,
      loginId,
      stats,
    );
    console.log(
      `[collect-recipients] GENERAL authCd 보강 완료 — 대상 ${generalActiveIds.length}명, 실패 ${stats.authCdLookupFailed}명, customRoles=${customRoles.join(",")}`,
    );
  }

  for (const userTp of userTypes) {
    const items = fetchedByUserType.get(userTp) ?? [];
    for (const item of items) {
      const mapped = mapRecipient(item, targets, superAdminIds, activeRoleCodes, authCdMap, stats);
      if (!mapped) continue;
      if (!dedupedByEmail.has(mapped.email)) {
        dedupedByEmail.set(mapped.email, mapped);
      }
    }
  }

  const recipients = Array.from(dedupedByEmail.values());
  console.log(
    `[collect-recipients] 발송대상 수집 완료 — userTypes: ${userTypes.join(",")}, 수집: ${recipients.length}건`,
  );

  const statsParts: string[] = [];
  if (stats.adminUserIdNull > 0) statsParts.push(`adminUserIdNull=${stats.adminUserIdNull}`);
  if (stats.invalidEmail > 0) statsParts.push(`invalidEmail=${stats.invalidEmail}`);
  if (stats.newsRcptOptOut > 0) statsParts.push(`newsRcptOptOut=${stats.newsRcptOptOut}`);
  if (stats.superAdminOnlyExcluded > 0) {
    statsParts.push(`superAdminOnlyExcluded=${stats.superAdminOnlyExcluded}`);
  }
  if (stats.authCdLookupFailed > 0) {
    statsParts.push(`authCdLookupFailed=${stats.authCdLookupFailed}`);
  }
  if (statsParts.length > 0) {
    console.warn(`[collect-recipients] silent 제외/폴백 카운트 — ${statsParts.join(", ")}`);
  }

  return recipients;
}
