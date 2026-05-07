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
 * - 운영자 정의 추가 권한은 QSP 회원 매핑 미정 → 발송 시점 미발송 (skip)
 *
 * Plan: mass-mail-send.plan.md §5
 * Design: mass-mail-send.design.md §2
 */

import { QSP_API, SITE_DEFAULTS, MASS_MAIL_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLE_CODES } from "@/lib/schemas/common";
import { qspMemberListResponseSchema, lookupStatCd } from "@/lib/schemas/member";

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
 * roleCode 배열 → QSP userTp 조회 대상 결정.
 * 운영자 정의 추가 권한(SYSTEM_ROLE_CODES 외)은 QSP 회원 매핑 미정 → 무시 (운영 정책 추후).
 */
function resolveUserTypesToQuery(targets: CollectTargets): string[] {
  // SEKO 미지원 — 사전 차단
  if (targets.roleCodes.includes("SEKO")) {
    console.error(
      "[collect-recipients] 시공점(SEKO) 발송 대상 선택됨 — AS-IS API 미확보로 미지원 (라우트 단계 검증 누락 가능성)",
    );
    throw new SekoNotSupportedError();
  }

  // 운영자 정의 추가 권한 감지 — 발송 매핑 미정이라 warn
  const customRoles = targets.roleCodes.filter((c) => !SYSTEM_ROLE_CODES.has(c));
  if (customRoles.length > 0) {
    console.warn(
      `[collect-recipients] 운영자 정의 추가 권한은 발송 대상 매핑 미정 — skip: ${customRoles.join(",")}`,
    );
  }

  const userTypes = new Set<string>();
  for (const code of targets.roleCodes) {
    if (code === "SUPER_ADMIN" || code === "ADMIN") userTypes.add("ADMIN");
    else if (code === "1ST_STORE" || code === "2ND_STORE") userTypes.add("STORE");
    else if (code === "GENERAL") userTypes.add("GENERAL");
    // 운영자 정의 추가 권한은 매핑 안 함 (skip)
  }
  return Array.from(userTypes);
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
}

/** QSP 응답 아이템 → 필터 + authRoleCode 매핑 결정. null 반환 시 제외 */
function mapRecipient(
  item: QspMemberItem,
  targets: CollectTargets,
  superAdminIds: Set<string>,
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
    case "GENERAL":
      if (targetRoleCodes.has("GENERAL")) authRoleCode = "GENERAL";
      break;
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
  const userTypes = resolveUserTypesToQuery(targets);
  if (userTypes.length === 0) return [];

  const context: CollectionContext = { targets, callerRoute, loginId };
  const dedupedByEmail = new Map<string, CollectedRecipient>();
  const stats: RecipientStats = {
    adminUserIdNull: 0,
    invalidEmail: 0,
    newsRcptOptOut: 0,
    superAdminOnlyExcluded: 0,
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

  for (const userTp of userTypes) {
    const items = fetchedByUserType.get(userTp) ?? [];
    for (const item of items) {
      const mapped = mapRecipient(item, targets, superAdminIds, stats);
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
  if (statsParts.length > 0) {
    console.warn(`[collect-recipients] silent 제외/폴백 카운트 — ${statsParts.join(", ")}`);
  }

  return recipients;
}
