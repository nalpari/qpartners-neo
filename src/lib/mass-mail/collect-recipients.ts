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

/** QSP 응답 아이템 → 필터 + authRole 매핑 결정. null 반환 시 제외 */
function mapRecipient(item: QspMemberItem, targets: CollectTargets): CollectedRecipient | null {
  // 활성 회원만 (A) — D(삭제), R(탈퇴) 제외
  if (lookupStatCd(item.statCd) !== "active") return null;

  // 이메일 null/빈값 제외
  const email = item.email?.trim();
  if (!email) return null;

  // 뉴스레터 수신거부 제외 (optOut=false 인 경우)
  if (!targets.optOut && item.newsRcptYn === "N") return null;

  // userTp 별 매핑 — targets 와 일치하지 않으면 제외
  let authRole: RecipientAuthRole | null = null;
  switch (item.userTp) {
    case "ADMIN":
      // SUPER_ADMIN 구분은 QSP 응답에 미포함 — 1차는 ADMIN 통합 처리
      if (targets.targetSuperAdmin || targets.targetAdmin) {
        authRole = "ADMIN";
      }
      break;
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

  for (const userTp of userTypes) {
    const items = await fetchAllByUserType(userTp, context);
    for (const item of items) {
      const mapped = mapRecipient(item, targets);
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
  return recipients;
}
