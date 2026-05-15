/**
 * JST(UTC+9) day 단위 날짜 유틸리티.
 *
 * 게시기간·홈공지 등 "일 단위" 비교가 필요한 곳에서
 * 서버 컨테이너 TZ 에 의존하지 않고 JST 자정을 명시 계산한다.
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** JST 기준 `d` 가 속한 날의 자정(00:00) — UTC Date 로 반환. */
export function jstDayStart(d: Date = new Date()): Date {
  return new Date(
    Math.floor((d.getTime() + JST_OFFSET_MS) / ONE_DAY_MS) * ONE_DAY_MS - JST_OFFSET_MS,
  );
}

/** JST 기준 `d` 다음 날 자정(00:00) — "오늘 종일" 포함 비교(`< tomorrowStart`)용. */
export function jstNextDayStart(d: Date = new Date()): Date {
  return new Date(jstDayStart(d).getTime() + ONE_DAY_MS);
}

/**
 * "yyyy-MM-dd" 문자열을 JST 자정(00:00) UTC Date 로 파싱.
 * 검색 필터의 startDate/endDate 파라미터를 일관되게 JST 로 해석할 때 사용.
 */
export function jstParseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00+09:00`);
}

/**
 * "yyyy-MM-dd" 문자열을 JST 23:59:59.999 UTC Date 로 파싱.
 * 검색 필터의 endDate 상한(inclusive) 비교에 사용.
 */
export function jstParseDateOnlyEnd(s: string): Date {
  return new Date(`${s}T23:59:59.999+09:00`);
}

/**
 * JST 기준 `YYYY{sep}MM{sep}DD` 문자열 직렬화.
 *
 * `toISOString` 은 UTC 기준이라 JST 자정 직후 다운로드는 전날 UTC 로 표시되는 회귀가 있어
 * JST(+09:00) 오프셋을 더한 뒤 UTC 컴포넌트로 추출한다.
 * separator 기본값 "." — 화면 표시용. API 파라미터(YYYY-MM-DD)는 "-" 지정.
 */
export function formatJstDate(
  date: Date | string,
  separator: "." | "-" = ".",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${separator}${m}${separator}${day}`;
}
