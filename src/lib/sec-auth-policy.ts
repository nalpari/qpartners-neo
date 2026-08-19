import { prisma } from "@/lib/prisma";

/**
 * 2차인증(2FA) 필요 여부 판정 — QSP·SEKO 공용.
 *
 * 두 인증 소스가 같은 정책을 쓰도록 한곳에 모은다. 회원유형별로 판정을 따로 두면
 * 재인증 주기가 조용히 갈라져 "시공점만 2FA 가 안 걸리는" 류의 회귀가 생긴다.
 *
 * 소스별 차이는 인자 2개로만 흡수한다:
 *  - `adminDisabled` — QSP 는 `secAuthYn === "N"`(관리자 명시 해제), SEKO 는 대응 필드가 없어 항상 false
 *  - `parseDate`     — QSP 는 `YYYY.MM.DD`(parseQspDate), SEKO 는 `YYYY-MM-DD`(parseSekoDate)
 */

/** 판정 사유 — 운영 로그 + dev 응답 진단 메타에서 "왜 요구/면제됐는지" 추적용. */
export type TwoFactorReason =
  | "DISABLED_BY_ADMIN"
  | "FIRST_TIME_REQUIRED"
  | "EXPIRED_REQUIRED"
  | "WITHIN_VALIDITY"
  | "FAIL_CLOSED";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `secAuthDt` 미래 허용 오차 — 이 값을 넘어서는 미래 시각은 이상값으로 보고 fail-closed. */
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * `SEC_AUTH_VALIDITY` 공통코드 → 재인증 주기(일). 미등록·이상값·조회 실패는 `null`.
 *
 * 관리자 "코드관리" 화면에서 여러 개 활성(isActive=Y)이면 sortOrder 오름차순 최상위 1건을 채택한다.
 * 등록/수정 단계에서 1~90 정수 상한 가드(validateSecAuthValidityCode)가 걸리므로 여기 도달하는
 * 값은 정상 범위지만, 런타임 fail-closed 는 유지한다.
 */
async function resolveValidityDays(logTag: string): Promise<number | null> {
  try {
    const activeCode = await prisma.codeDetail.findFirst({
      where: {
        header: { headerCode: "SEC_AUTH_VALIDITY" },
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
      select: { code: true },
    });
    if (!activeCode) {
      console.warn(`${logTag} SEC_AUTH_VALIDITY 공통코드 미등록 — 2FA 필수 처리`);
      return null;
    }
    const days = Number(activeCode.code);
    if (Number.isSafeInteger(days) && days > 0) return days;
    console.error(`${logTag} SEC_AUTH_VALIDITY 값 이상:`, activeCode.code);
    return null;
  } catch (error) {
    console.error(`${logTag} 2FA 유효기간 조회 실패 — 2FA 필요로 처리:`, error);
    return null;
  }
}

/**
 * 2FA 필요 여부 판정.
 *
 * 정책 (관리자 명시 해제 최우선):
 *  - 최우선 면제: `adminDisabled` — `secAuthDt` 유무 무관 면제.
 *    "신규(secAuthDt=null) 무조건 강제" 보다 우선 — 운영자가 명시적으로 끈 회원은 첫 로그인도 통과
 *  - 신규(`secAuthDt` 없음) + 해제 아님 → 최초 1회 2FA 필수 (이메일 미등록 시 설정 유도)
 *  - 만료 판정: `secAuthDt` + 유효기간 ≤ now → 필요 / > now → 불필요(최근 인증됨)
 *
 * 유효기간 조회 실패·날짜 파싱 실패·계산 실패는 모두 **fail-closed(2FA 필요)** 다.
 * 판정 불가를 "최근 인증됨" 으로 접으면 2FA 가 조용히 무력화된다.
 */
export async function evaluateTwoFactorRequirement(params: {
  adminDisabled: boolean;
  secAuthDt: string | null | undefined;
  parseDate: (input: string | null | undefined) => string | null;
  logTag: string;
}): Promise<{ requireTwoFactor: boolean; reason: TwoFactorReason }> {
  const { adminDisabled, secAuthDt, parseDate, logTag } = params;

  if (adminDisabled) {
    return { requireTwoFactor: false, reason: "DISABLED_BY_ADMIN" };
  }
  if (!secAuthDt) {
    return { requireTwoFactor: true, reason: "FIRST_TIME_REQUIRED" };
  }

  const validityDays = await resolveValidityDays(logTag);
  if (validityDays === null) {
    return { requireTwoFactor: true, reason: "FAIL_CLOSED" };
  }

  // PII 노출 방지: 파싱 실패 시 원본 문자열 대신 길이만 로깅 (파서 내부 정책과 일치).
  const authIso = parseDate(secAuthDt);
  if (!authIso) {
    console.error(`${logTag} secAuthDt 파싱 실패 — length:`, secAuthDt.length);
    return { requireTwoFactor: true, reason: "FAIL_CLOSED" };
  }

  const authMs = new Date(authIso).getTime();
  if (Number.isNaN(authMs)) {
    console.error(`${logTag} secAuthDt 만료 계산 실패 — length:`, secAuthDt.length);
    return { requireTwoFactor: true, reason: "FAIL_CLOSED" };
  }

  // 미래 날짜 상한 — `secAuthDt` 가 현재보다 앞서면 만료식이 영원히 성립하지 않아 2FA 가
  // 무기한 면제된다(fail-open). 외부 시스템이 주는 값이라 서버 시계 어긋남이나 데이터
  // 훼손으로 도달 가능하므로, 판정 불가와 같은 등급으로 보아 fail-closed 로 접는다.
  // 소규모 시계 오차(양 시스템 NTP 편차)까지 막지 않도록 허용 오차를 둔다.
  const now = Date.now();
  if (authMs > now + FUTURE_SKEW_TOLERANCE_MS) {
    console.error(
      `${logTag} secAuthDt 가 미래 시각 — 2FA 필요로 처리 (skew: ${Math.round((authMs - now) / 1000)}s)`,
    );
    return { requireTwoFactor: true, reason: "FAIL_CLOSED" };
  }

  const requireTwoFactor = now >= authMs + validityDays * MS_PER_DAY;
  return {
    requireTwoFactor,
    reason: requireTwoFactor ? "EXPIRED_REQUIRED" : "WITHIN_VALIDITY",
  };
}
