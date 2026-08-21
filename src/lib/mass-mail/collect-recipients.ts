/**
 * 대량메일 발송대상 이메일 수집
 *
 * QSP 회원관리 목록 API(userListMng)를 페이징 호출하여 발송대상 이메일을 수집한다.
 * - storeLvl / newsRcptYn 을 목록에서 직접 받아 필터링
 * - email 기준 중복 제거(대소문자 무시)
 * - 시공점(SEKO)은 AS-IS Connector No.7 getUserList 로 별도 수집 (QSP 목록에 없다)
 *
 * Target Dynamic from Role (2026-05-07):
 * - boolean 6개 → targetRoleCodes 배열 (qp_roles.roleCode)
 * - RecipientAuthRole enum → String snapshot (FK 없음)
 *
 * 운영자 정의 추가 권한 발송 (2026-05-29 / 2026-07-30 개선):
 * - 커스텀 권한은 GENERAL userTp 회원에게만 authCd 로 부여됨 (회원관리 정책).
 * - userListMng 목록 응답의 authCd 로 effective role 을 직접 매칭한다.
 *   (구: GENERAL 회원별 userDetail 를 N+1 호출해 authCd 보강 → 목록 응답 authCd 사용으로 개선)
 *
 * Plan: mass-mail-send.plan.md §5
 * Design: mass-mail-send.design.md §2
 */

import { resolveActiveRoleCodes } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS, MASS_MAIL_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLE_CODES } from "@/lib/schemas/common";
import { qspMemberListResponseSchema, lookupStatCd } from "@/lib/schemas/member";
import { sekoGetUserList } from "@/lib/seko-connector";

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
  authCd?: string | null;
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

/**
 * roleCode 배열 → QSP userTp 조회 대상 + 커스텀 권한 + SEKO 포함 여부.
 * 커스텀 권한은 항상 GENERAL userTp 회원에게만 부여되므로 (회원관리 정책)
 * 커스텀 권한이 targets 에 있으면 GENERAL 을 query 대상에 강제 포함.
 *
 * 시공점(SEKO)은 **QSP 회원목록에 존재하지 않는다** — AS-IS Connector No.7 로 따로 받아온다.
 * 그래서 userTypes 가 아니라 별도 플래그로 돌려준다.
 */
function resolveUserTypesToQuery(targets: CollectTargets): {
  userTypes: string[];
  customRoles: string[];
  includeSeko: boolean;
} {
  const includeSeko = targets.roleCodes.includes("SEKO");

  const customRoles = targets.roleCodes.filter((c) => !SYSTEM_ROLE_CODES.has(c));

  const userTypes = new Set<string>();
  for (const code of targets.roleCodes) {
    if (code === "SUPER_ADMIN" || code === "ADMIN") userTypes.add("ADMIN");
    else if (code === "1ST_STORE" || code === "2ND_STORE") userTypes.add("STORE");
    else if (code === "GENERAL") userTypes.add("GENERAL");
  }
  // 커스텀 권한은 GENERAL userTp 위에 부여되므로 GENERAL 회원목록을 강제 조회
  if (customRoles.length > 0) userTypes.add("GENERAL");

  return { userTypes: Array.from(userTypes), customRoles, includeSeko };
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

/**
 * 중복 판정 전용 키. `qp_mass_mail_recipients` 의 `uq_mass_mail_email` 이
 * utf8mb4_unicode_ci(대소문자 무시)라, 원문 그대로 판정하면 대소문자만 다른 두 주소가 함께
 * 살아남아 INSERT 가 P2002 로 터지고 트랜잭션이 통째로 롤백된다 — 한 명 때문에 메일 전체가
 * 실패한다. QSP `email` 과 SEKO `loginId` 는 출처가 달라 표기가 갈릴 여지도 크다.
 * 발송에는 원문 주소를 그대로 쓰고 판정만 이 키로 한다.
 */
function normalizeEmailKey(email: string): string {
  return email.toLowerCase();
}

interface RecipientStats {
  adminUserIdNull: number;
  invalidEmail: number;
  newsRcptOptOut: number;
  superAdminOnlyExcluded: number;
  /** SEKO 수신동의 판정 불가 건수 — 0 이 아니면 수집을 실패시킨다(fetchSekoRecipients). */
  sekoNewsRcptUnknown: number;
}

/**
 * SEKO 수신동의 값 판정. 공백·대소문자만 흡수하고, 그 밖의 값(필드 결손 포함)은
 * **판정 불가**로 본다 — "동의로 간주"도 "거부로 간주"도 하지 않는다.
 */
function readNewsRcpt(raw: string | null | undefined): "Y" | "N" | "UNKNOWN" {
  const value = raw?.trim().toUpperCase();
  return value === "Y" || value === "N" ? value : "UNKNOWN";
}

/**
 * SEKO(No.7) 수집 — QSP 페이징 루프와 달리 **1회 호출로 전량**이 온다(커넥터가 페이징을 지원하지
 * 않는다). 커넥터가 `status="1"`(利用可)만 요청하므로 여기서 상태 필터는 하지 않는다.
 *
 * 시공점은 **로그인 ID 가 곧 이메일**이라 `loginId` 를 주소로 쓴다(이메일 전용 필드가 없다).
 * 수신자명은 사양서 비고대로 `sei`+`mei` 를 이어붙인다.
 *
 * 실패는 throw 한다 — 조용히 빈 배열을 돌려주면 시공점 대상 발송이 「0명 수집 성공」으로
 * 완료 처리되어, 아무에게도 안 갔다는 사실이 어디에도 남지 않는다.
 */
async function fetchSekoRecipients(
  targets: CollectTargets,
  callerRoute: string,
  stats: RecipientStats,
): Promise<CollectedRecipient[]> {
  const result = await sekoGetUserList(callerRoute);
  if (!result.ok) {
    throw new Error(
      `SEKO getUserList 조회 실패: status=${result.error.status}, errorCode=${result.error.errorCode ?? "-"}`,
    );
  }

  const recipients: CollectedRecipient[] = [];
  for (const item of result.items) {
    const email = item.loginId.trim();
    if (!isSafeEmail(email)) {
      stats.invalidEmail++;
      continue;
    }
    // optOut=true 는 수신거부 포함 발송이라 동의값 판정 자체가 불필요하다.
    if (!targets.optOut) {
      const consent = readNewsRcpt(item.newsRcptYn);
      if (consent === "N") {
        stats.newsRcptOptOut++;
        continue;
      }
      if (consent === "UNKNOWN") {
        stats.sekoNewsRcptUnknown++;
        continue;
      }
    }
    const userName = `${item.sei ?? ""}${item.mei ?? ""}`.trim();
    recipients.push({
      email,
      userName: userName.length > 0 ? userName : null,
      authRoleCode: "SEKO",
    });
  }

  // 동의 여부를 확인할 수 없는 회원이 하나라도 있으면 수집 전체를 실패시킨다. 발송하면
  // 수신거부 의사 위반이고, 조용히 빼면 「시공점 전원 누락」이 어디에도 남지 않는다.
  // 둘 다 피하는 유일한 선택지가 운영자에게 보이는 실패(send_failed → 재시도 경로)다.
  if (stats.sekoNewsRcptUnknown > 0) {
    throw new Error(
      `SEKO 수신동의(newsRcptYn) 판정 불가 ${stats.sekoNewsRcptUnknown}건 — 상대측 응답 확인 필요`,
    );
  }

  console.log(
    `[collect-recipients] SEKO 수집 — 응답 ${result.items.length}건 → 대상 ${recipients.length}건`,
  );
  return recipients;
}

/**
 * QSP 응답 아이템 → 필터 + authRoleCode 매핑 결정. null 반환 시 제외.
 *
 * GENERAL 분기는 useAuthCd=true 일 때 목록 응답의 authCd 로 effective role 을 정확 계산.
 * useAuthCd=false 면 기존 동작(=무조건 GENERAL 로 매칭) 유지 — 커스텀 권한 targets 가
 * 없는 경우의 매칭 의미를 보존 (resolveAuthRole 와의 미세 불일치는 trade-off).
 */
function mapRecipient(
  item: QspMemberItem,
  targets: CollectTargets,
  superAdminIds: Set<string>,
  activeRoleCodes: ReadonlySet<string>,
  useAuthCd: boolean,
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
      // useAuthCd 면 목록 응답의 authCd 로 resolveAuthRole 와 동일 정책의 effective role 계산.
      // 아니면(=커스텀 targets 없음) 기존 동작 유지 — userTp=GENERAL 회원은 모두 GENERAL 매칭.
      let effectiveRole = "GENERAL";
      if (useAuthCd) {
        const authCd = item.authCd ?? null;
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
  const { userTypes, customRoles, includeSeko } = resolveUserTypesToQuery(targets);
  if (userTypes.length === 0 && !includeSeko) return [];

  const context: CollectionContext = { targets, callerRoute, loginId };
  const dedupedByEmail = new Map<string, CollectedRecipient>();
  const stats: RecipientStats = {
    adminUserIdNull: 0,
    invalidEmail: 0,
    newsRcptOptOut: 0,
    superAdminOnlyExcluded: 0,
    sekoNewsRcptUnknown: 0,
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

  // 커스텀 권한 발송 시에만 목록 응답 authCd 로 effective role 계산.
  // 6 기본 권한만 발송하는 경우 GENERAL 회원은 모두 GENERAL 로 매칭(기존 동작 유지).
  const useAuthCd = customRoles.length > 0;
  let activeRoleCodes: ReadonlySet<string> = new Set<string>();
  if (useAuthCd) {
    activeRoleCodes = await resolveActiveRoleCodes();
    console.log(
      `[collect-recipients] 커스텀 권한 발송 — 목록 authCd 로 effective role 매칭 (customRoles=${customRoles.join(",")})`,
    );
  }

  for (const userTp of userTypes) {
    const items = fetchedByUserType.get(userTp) ?? [];
    for (const item of items) {
      const mapped = mapRecipient(item, targets, superAdminIds, activeRoleCodes, useAuthCd, stats);
      if (!mapped) continue;
      const key = normalizeEmailKey(mapped.email);
      if (!dedupedByEmail.has(key)) {
        dedupedByEmail.set(key, mapped);
      }
    }
  }

  // SEKO 는 QSP 목록과 출처가 달라 마지막에 합친다. 같은 주소가 양쪽에 있으면 **먼저 담긴
  // QSP 쪽 권한을 유지**한다 — QSP 매핑이 authCd·storeLvl 까지 본 결과라 더 구체적이다.
  if (includeSeko) {
    for (const recipient of await fetchSekoRecipients(targets, callerRoute, stats)) {
      const key = normalizeEmailKey(recipient.email);
      if (!dedupedByEmail.has(key)) {
        dedupedByEmail.set(key, recipient);
      }
    }
  }

  const recipients = Array.from(dedupedByEmail.values());
  const sourceLabel = [...userTypes, ...(includeSeko ? ["SEKO"] : [])].join(",");
  console.log(
    `[collect-recipients] 발송대상 수집 완료 — 대상: ${sourceLabel}, 수집: ${recipients.length}건`,
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
