import { SEARCH_KEYWORD_MIN } from "@/lib/schemas/common";

/**
 * 검색어 토큰화 — **서버·클라이언트 공용**.
 *
 * `lib/content-search.ts` 에 두면 클라이언트 컴포넌트가 import 할 때 `next/server` 와
 * rate-limit 구현까지 번들에 끌려 들어온다. 판정 기준이 양쪽에서 갈리면 안 되므로
 * (아래 ⚠️ 참조) 토큰화만 의존성 없는 모듈로 떼어 둔다.
 */

/**
 * 키워드 토큰 상한.
 * 선행 와일드카드 LIKE(`%kw%`)는 인덱스를 못 타므로 토큰 수가 그대로 full scan 비용이 된다.
 * keyword 는 100자 제한이라 이론상 50토큰까지 들어올 수 있어 상한을 둔다.
 */
export const KEYWORD_TOKEN_LIMIT = 10;

/**
 * 검색어를 공백 기준으로 토큰 분리 — 연속 공백은 구분자 하나로 처리한다.
 * JS `\s` 는 전각 공백(U+3000)도 포함하므로 일본어 입력 환경을 그대로 커버한다.
 *
 * **3자 미만 단어는 버린다** (Redmine #2751, 2026-11-11 사용자 확정). 공백은 **구분자**이지
 * 글자가 아니다 — `ab cd` 는 5자가 아니라 2자 단어 두 개이고, 둘 다 조건에서 빠진다.
 * `ab tron` 과 `abtron` 이 다른 입력인 이유도 같다.
 *
 * ⚠️ **판정을 여기 한 곳에만 둔다.** 자료일람·제품일람·자동완성(서버)과 「검색으로 취급할지」를
 * 정하는 목록 화면(클라이언트)이 모두 이 함수를 쓴다. 한쪽이 전체 문자열 길이로 세면
 *   - 서버: 토큰 0개 → 키워드 조건 없음 → 전건
 *   - 클라이언트: 「유효한 검색」으로 보고 좌측 분류 체크를 결과 기준으로 덮음
 * 이 되어, 사용자가 걸어 둔 분류 조건이 사라지고 목록이 전건으로 뒤집힌다.
 *
 * 토큰 상한 절단은 **필터 뒤**다. 2자 이하 단어가 상한을 먼저 소진해 뒤의 유효 단어가
 * 버려지는 것을 막는다.
 *
 * 남는 단어가 없으면 빈 배열이고, 조건 빌더가 `undefined` 를 반환해 **키워드 조건이 아예
 * 붙지 않는다** — 목록 화면은 이 경우를 2자 단독 입력과 같은 「검색 아님」으로 처리한다.
 */
export function tokenizeKeyword(keyword: string | undefined): string[] {
  if (!keyword) return [];
  return keyword
    .split(/\s+/)
    .filter((token) => token.length >= SEARCH_KEYWORD_MIN)
    .slice(0, KEYWORD_TOKEN_LIMIT);
}
