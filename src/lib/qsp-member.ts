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
 * QSP 유저 정보 조회 공통 헬퍼 (사양서 No.13 userDetail).
 * userTp에 따라 조회 키가 다름: GENERAL → email, ADMIN/STORE/SEKO → loginId
 *
 * framework-agnostic: NextResponse를 반환하지 않으며, 호출부에서 HTTP 응답으로 변환한다.
 */
export async function fetchQspUserDetail(
  rawId: string,
  userTp: UserTp,
  logTag: string,
  userId?: string,
): Promise<{ ok: true; detail: QspMemberDetail } | { ok: false; error: QspFetchError }> {
  const qspParams = new URLSearchParams({ accsSiteCd: SITE_DEFAULTS.accsSiteCd, userTp });
  if (userTp === "GENERAL") {
    qspParams.set("email", rawId);
  } else {
    qspParams.set("loginId", rawId);
  }

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
  // 포맷 미일치는 null 반환 + 샘플 warn — QSP 가 포맷을 바꿨을 때 전 회원 timestamp
  // 가 일제히 null 되는 모니터링 사각지대를 제거하기 위한 드리프트 감지용.
  // 샘플은 최대 30자만 노출 (timestamp 는 PII 아님).
  const match = /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/.exec(trimmed);
  if (!match) {
    console.warn(`[parseQspDate] QSP 날짜 포맷 불일치 — drift 가능성, sample="${trimmed.slice(0, 30)}"`);
    return null;
  }

  const [, yyyy, mm, dd, hh = "00", min = "00", ss = "00"] = match;
  // 유효 날짜인지 검증 — JS Date 는 "2026.02.30" 을 "3월 2일" 로 자동 rollover 하므로
  // getTime NaN 만으로는 부족. JST(+09:00) 기준 입력값과 결과의 연/월/일이 일치하는지 cross-check.
  const probe = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`);
  if (Number.isNaN(probe.getTime())) {
    console.warn(`[parseQspDate] 유효하지 않은 날짜, sample="${trimmed.slice(0, 30)}"`);
    return null;
  }
  // toLocaleString 으로 JST 기준 분해 (toISOString 은 UTC 라 +09:00 입력과 어긋남).
  // sv-SE locale 은 ISO 와 유사한 "YYYY-MM-DD HH:mm:ss" 형태 보장.
  const jstParts = probe.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
  const expected = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  if (jstParts !== expected) {
    // rollover 되어 날짜가 보정된 케이스 (예: 2026.02.30 → 3월 2일)
    console.warn(`[parseQspDate] rollover 감지 — 입력값="${trimmed.slice(0, 30)}", JST 변환 결과="${jstParts}"`);
    return null;
  }

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`;
}
