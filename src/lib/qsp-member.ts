import type { z } from "zod";

import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { qspMemberDetailResponseSchema } from "@/lib/schemas/member";
import type { UserTp } from "@/lib/schemas/common";

export type QspMemberDetail = NonNullable<
  z.infer<typeof qspMemberDetailResponseSchema>["data"]
>;

export type QspFetchError = {
  error: string;
  status: number;
};

/**
 * QSP full-replace 방어용 보존 필드 키 목록.
 * 이 배열이 single source of truth — 타입(`QspPreservedFieldKeys`)과
 * `buildQspPreservedFields()` 헬퍼가 이 배열을 참조한다.
 *
 * ⚠️  mutable 필드(authCd, statCd, secAuthYn 등)는 절대 추가 금지
 *     — spread 순서에 따라 권한값을 덮어쓰는 silent privilege escalation 위험.
 */
const QSP_PRESERVED_KEYS = [
  "userNm", "userNmKana",
  "user1stNm", "user2ndNm", "user1stNmKana", "user2ndNmKana",
  "email",
  "compNm", "compNmKana",
  "compPostCd", "compAddr", "compAddr2", "compTelNo", "compFaxNo",
  "compCd", "deptNm", "pstnNm", "storeLvl",
] as const satisfies ReadonlyArray<keyof QspMemberDetail>;

export type QspPreservedFieldKeys = (typeof QSP_PRESERVED_KEYS)[number];

/**
 * preDetail 존재 시 보존 필드를 QSP 페이로드용 객체로 조립.
 * null 값은 빈 문자열로 변환 — QSP full-replace 가 null 로 덮어쓰지 않도록.
 * preDetail null(F_NOT_USER) 이면 빈 객체 반환.
 */
export function buildQspPreservedFields(
  preDetail: QspMemberDetail | null,
): Partial<Pick<QspMemberDetail, QspPreservedFieldKeys>> {
  if (!preDetail) return {};
  const result: Record<string, string> = {};
  for (const key of QSP_PRESERVED_KEYS) {
    result[key] = preDetail[key] ?? "";
  }
  return result as Partial<Pick<QspMemberDetail, QspPreservedFieldKeys>>;
}

/**
 * QSP 유저 정보 조회 공통 헬퍼 (사양서 No.13 userDetail).
 * 모든 userTp 에 대해 loginId(= user_id) 로만 조회한다.
 *
 * QSP 동작 (담당자 회신 2026-04-27):
 *   email 이 함께 전달되면 QSP 가 email 우선 매칭으로 동작하여, 동일 email 을 가진
 *   GENERAL 회원이 다수일 경우 selectOne() 이 TooManyResultsException 으로 실패한다.
 *   email 매칭은 비밀번호 초기화 (사용자 조회) 흐름 전용이며, 일반 조회에서는 보내지 않는다.
 *
 * framework-agnostic: NextResponse를 반환하지 않으며, 호출부에서 HTTP 응답으로 변환한다.
 */
export async function fetchQspUserDetail(
  rawId: string,
  userTp: UserTp,
  logTag: string,
  userId?: string,
): Promise<{ ok: true; detail: QspMemberDetail } | { ok: false; error: QspFetchError }> {
  const qspParams = new URLSearchParams({
    accsSiteCd: SITE_DEFAULTS.accsSiteCd,
    userTp,
    loginId: rawId,
  });

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.userDetail}?${qspParams.toString()}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: logTag,
        userId: maskEmail(userId ?? rawId),
        userType: userTp,
      },
    );
  } catch (error: unknown) {
    console.error(`${logTag} QSP 회원 조회 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }
  if (!qspResponse.ok) {
    console.error(`${logTag} QSP 비정상 응답:`, qspResponse.status);
    return { ok: false, error: { error: "外部サーバーエラーが発生しました", status: 502 } };
  }
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error: unknown) {
    console.error(`${logTag} QSP 응답 파싱 실패:`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }
  const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(`${logTag} QSP 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }
  const resultCode = parsed.data.result.resultCode;
  // F_NOT_USER(회원 미존재)만 404, 그 외 비정상 코드는 502
  if (resultCode === "F_NOT_USER") {
    console.warn(`${logTag} QSP 회원 조회 결과 없음 (resultCode: ${resultCode})`);
    return { ok: false, error: { error: "会員情報が見つかりません", status: 404 } };
  }
  if (resultCode !== "S" || !parsed.data.data) {
    console.error(`${logTag} QSP 회원 조회 실패 (resultCode: ${resultCode})`);
    return { ok: false, error: { error: "外部サーバーエラーが発生しました", status: 502 } };
  }
  return { ok: true, detail: parsed.data.data };
}

/** YYYY.MM.DD 또는 YYYY.MM.DD HH:mm:ss 매칭 — parseQspDate 에서 사용. */
const QSP_DATE_RE = /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * QSP date 문자열 → ISO 8601 (JST +09:00) 정규화.
 *
 * QSP `userDetail` 의 `regDt` 는 "YYYY.MM.DD" (시각 없음), `uptDt` 는 "YYYY.MM.DD HH:mm:ss".
 * 둘 다 JST 가정 — 동일 ISO datetime 으로 통일하여 프론트 정렬/비교/포맷 변환을 단순화.
 *
 * - 시각 없는 날짜는 자정(00:00:00) 으로 채움 — 정보 없음 의미.
 * - 입력이 null/undefined/공백/포맷 불일치면 null 반환 (silent — caller 가 null 체크).
 *
 * 예시:
 *   "2022.04.20"          → "2022-04-20T00:00:00+09:00"
 *   "2026.04.14 15:32:45" → "2026-04-14T15:32:45+09:00"
 *   null / "" / "invalid" → null
 */
export function parseQspDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // YYYY.MM.DD HH:mm:ss 또는 YYYY.MM.DD 만 허용.
  // 포맷 미일치는 null 반환 + 길이 warn — QSP 가 포맷을 바꿨을 때 전 회원 timestamp
  // 가 일제히 null 되는 모니터링 사각지대를 제거하기 위한 드리프트 감지용.
  // 원문 노출은 회피(QSP 버그로 PII 혼입 시 로그 유출 방지).
  const match = QSP_DATE_RE.exec(trimmed);
  if (!match) {
    console.warn(`[parseQspDate] QSP 날짜 포맷 불일치 — drift 가능성, length=${trimmed.length}`);
    return null;
  }

  const [, yyyy, mm, dd, hh = "00", min = "00", ss = "00"] = match;
  // 유효 날짜인지 검증 — JS Date 는 "2026.02.30" 을 "3월 2일" 로 자동 rollover 하거나
  // "25:00:00" 을 다음 날로 넘기므로 getTime NaN 만으로는 부족.
  // JST(+09:00) 기준 입력값과 결과의 연/월/일/시/분/초가 일치하는지 cross-check.
  const probe = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`);
  if (Number.isNaN(probe.getTime())) {
    console.warn(`[parseQspDate] 유효하지 않은 날짜, length=${trimmed.length}`);
    return null;
  }
  // Intl 비의존 UTC 수학으로 JST 성분 복원 (sv-SE locale 은 ICU 빌드 의존성이 있어
  // Alpine small-icu 등에서 전 회원 timestamp 가 일제히 null 되는 silent 장애 위험).
  // +09:00 으로 파싱한 UTC ms 에 9h 를 더해 UTC 로 읽으면 JST 성분이 된다.
  const jst = new Date(probe.getTime() + 9 * 60 * 60 * 1000);
  if (
    jst.getUTCFullYear() !== Number(yyyy) ||
    jst.getUTCMonth() + 1 !== Number(mm) ||
    jst.getUTCDate() !== Number(dd) ||
    jst.getUTCHours() !== Number(hh) ||
    jst.getUTCMinutes() !== Number(min) ||
    jst.getUTCSeconds() !== Number(ss)
  ) {
    // rollover 되어 값이 보정된 케이스 (예: 2026.02.30 → 3월 2일, 25:00:00 → 익일 01:00)
    console.warn(`[parseQspDate] rollover 감지 — length=${trimmed.length}`);
    return null;
  }

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`;
}
