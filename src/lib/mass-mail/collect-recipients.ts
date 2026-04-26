/**
 * 대량메일 발송대상 이메일 수집
 *
 * QSP 회원관리 목록 API(userListMng)를 페이징 호출하여 발송대상 이메일을 수집한다.
 * - storeLvl / newsRcptYn 을 목록에서 직접 받아 필터링
 * - email 기준 중복 제거
 * - 시공점(SEKO)은 AS-IS API 미확보로 1차 제외
 *
 * Plan: mass-mail-send.plan.md §5
 * Design: mass-mail-send.design.md §2
 */

import { QSP_API, SITE_DEFAULTS, MASS_MAIL_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import { qspMemberListResponseSchema, lookupStatCd } from "@/lib/schemas/member";
import type { RecipientAuthRole } from "@/generated/prisma/client";

export interface CollectTargets {
  targetSuperAdmin: boolean;
  targetAdmin: boolean;
  targetFirstStore: boolean;
  targetSecondStore: boolean;
  targetConstructor: boolean;
  targetGeneral: boolean;
  /** true: 뉴스레터 수신거부 회원도 포함, false: 제외 */
  optOut: boolean;
}

export interface CollectedRecipient {
  email: string;
  userName: string | null;
  authRole: RecipientAuthRole;
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
 * 판정 기준은 로그인 시 `resolveAuthRole`(`src/lib/auth.ts`) 와 동일 — `qp_code_detail`
 * 의 `ADMIN_ROLE` 헤더에 userId 가 등록된 회원만 SUPER_ADMIN. 단일 진실 원천 유지를
 * 위해 별도 매핑 테이블/캐시 신설하지 않고 매 수집 시 IN 쿼리 1회로 해결.
 *
 * - 빈 배열 입력 시 빈 Set 반환 (불필요한 쿼리 회피)
 * - 조회 실패 시 throw — 호출부(`collectRecipients`)가 fail-closed 로 처리
 *   (ADMIN 회원 전원을 SUPER_ADMIN 으로 오승격하는 것보다 발송 실패가 안전)
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

/** 화면 체크박스 조합 → QSP userTp 조회 대상 결정 */
function resolveUserTypesToQuery(targets: CollectTargets): string[] {
  // SEKO는 AS-IS API 미확보로 미지원 — 라우트에서 400으로 차단되어야 하나
  // 우회 호출 방어 차원에서 명시적 에러 throw (조용한 스킵 금지)
  if (targets.targetConstructor) {
    console.error(
      "[collect-recipients] 시공점(SEKO) 발송 대상 선택됨 — AS-IS API 미확보로 미지원 (라우트 단계 검증 누락 가능성)",
    );
    throw new SekoNotSupportedError();
  }

  const userTypes: string[] = [];
  if (targets.targetSuperAdmin || targets.targetAdmin) userTypes.push("ADMIN");
  if (targets.targetFirstStore || targets.targetSecondStore) userTypes.push("STORE");
  if (targets.targetGeneral) userTypes.push("GENERAL");
  return userTypes;
}

/**
 * RFC 5321 기본 형식 + CRLF 차단 검증.
 *
 * - CR(\r) / LF(\n) 포함 시 SMTP 헤더 인젝션 가능성 (Bcc/From 추가 등) → 즉시 거부.
 * - QSP 가 보낸 이메일이 그대로 nodemailer `to` 필드로 전달되므로 신뢰 경계에서 차단.
 * - 화이트스페이스 / 빈 local-part / @ 누락 등도 거부.
 */
const EMAIL_BASIC_RE = /^[^\s<>"'\r\n]+@[^\s<>"'\r\n]+\.[^\s<>"'\r\n]+$/;
function isSafeEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (/[\r\n]/.test(email)) return false;
  return EMAIL_BASIC_RE.test(email);
}

/**
 * silent fallback 카운터 — collectRecipients 1회 호출 단위로 누적해 종료 시점에 1회 로깅.
 * mapRecipient 내부에서 throw / log spam 없이 운영자 추적 단서를 남기기 위함.
 */
interface RecipientStats {
  adminUserIdNull: number;
  invalidEmail: number;
  newsRcptOptOut: number;
  superAdminOnlyExcluded: number;
}

/** QSP 응답 아이템 → 필터 + authRole 매핑 결정. null 반환 시 제외 */
function mapRecipient(
  item: QspMemberItem,
  targets: CollectTargets,
  superAdminIds: Set<string>,
  stats: RecipientStats,
): CollectedRecipient | null {
  // 활성 회원만 (A) — D(삭제), R(탈퇴) 제외
  if (lookupStatCd(item.statCd) !== "active") return null;

  // 이메일 null/빈값/형식 오류/CRLF 인젝션 시도 제외 (SMTP 헤더 인젝션 방어)
  const email = item.email?.trim();
  if (!email || !isSafeEmail(email)) {
    if (email) stats.invalidEmail++;
    return null;
  }

  // 뉴스레터 수신거부 제외 (optOut=false 인 경우)
  if (!targets.optOut && item.newsRcptYn === "N") {
    stats.newsRcptOptOut++;
    return null;
  }

  // userTp 별 매핑 — targets 와 일치하지 않으면 제외
  let authRole: RecipientAuthRole | null = null;
  switch (item.userTp) {
    case "ADMIN": {
      // SUPER_ADMIN 판정은 ADMIN_ROLE 공통코드 매칭 (resolveAuthRole 와 동일 단일 진실 원천)
      // userId null 인 케이스는 SUPER_ADMIN 매칭 불가 → ADMIN 폴백 (최소 권한)
      if (!item.userId) stats.adminUserIdNull++;
      const isSuper = item.userId ? superAdminIds.has(item.userId) : false;
      if (isSuper && targets.targetSuperAdmin) {
        authRole = "SUPER_ADMIN";
      } else if (!isSuper && targets.targetAdmin) {
        authRole = "ADMIN";
      } else if (!isSuper && targets.targetSuperAdmin && !targets.targetAdmin) {
        // SUPER_ADMIN only 발송인데 이 회원이 ADMIN_ROLE 공통코드에 미등록 → silent 제외.
        // 운영자 audit 단서로 카운트만 누적, 종료 시 1회 로깅.
        stats.superAdminOnlyExcluded++;
      }
      break;
    }
    case "STORE":
      if (item.storeLvl === "1" && targets.targetFirstStore) {
        authRole = "FIRST_STORE";
      } else if (item.storeLvl === "2" && targets.targetSecondStore) {
        authRole = "SECOND_STORE";
      }
      break;
    case "GENERAL":
      if (targets.targetGeneral) authRole = "GENERAL";
      break;
  }

  if (authRole === null) return null;

  return {
    email,
    userName: item.userNm,
    authRole,
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

    // 마지막 페이지 판정 — 수집 누적이 totCnt 이상이거나 list가 비었으면 종료
    if (!list || list.length === 0 || collected.length >= totCnt) break;

    // 안전장치: 설정 상한 도달 시 경고
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
 * - 각 userTp 페이징 반복 → 필터 → 매핑 → email 중복 제거(선착순)
 * - ADMIN userTp 는 페이징 종료 후 ADMIN_ROLE 공통코드 IN 쿼리 1회로 SUPER_ADMIN 분리
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

  // userTp 별 응답을 모아둔 뒤, ADMIN 응답이 있으면 SUPER_ADMIN 판정용 IN 쿼리 1회 실행.
  // mapRecipient 호출은 SUPER_ADMIN set 확보 후 일괄 수행 (원래 페이징 순서 유지).
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
      // email 기준 중복 제거 — 선착순 유지
      if (!dedupedByEmail.has(mapped.email)) {
        dedupedByEmail.set(mapped.email, mapped);
      }
    }
  }

  const recipients = Array.from(dedupedByEmail.values());
  console.log(
    `[collect-recipients] 발송대상 수집 완료 — userTypes: ${userTypes.join(",")}, 수집: ${recipients.length}건`,
  );

  // silent fallback / 제외 카운트 가시화 — 0 인 항목은 생략, 운영자 audit 단서 (PII 미포함).
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
