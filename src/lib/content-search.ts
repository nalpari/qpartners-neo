/**
 * 콘텐츠 키워드 검색 조건 — 검색기능 고도화 Phase 3.
 *
 * `/api/contents` GET 안에 있던 토큰 분리·OR 그룹 조립을 끌어낸 모듈이다.
 *
 * ⚠️ **자료와 제품은 키워드 대상이 다르다** (2026-11-03 확정, Redmine #2760).
 *   - 자료(`buildKeywordCondition`)  → 제목
 *   - 제품(`buildModelCodeCondition`) → 형번명
 *
 * 종전에는 두 탭이 한 조건을 공유했고(목업 `currentResults()` 를 양쪽이 썼다), 그 탓에
 * 「자동완성 2건인데 목록 6건」이 나왔다. 분류축·노출 범위·게시기간은 여전히 같다.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

import { checkRateLimit } from "@/lib/rate-limit";

/**
 * 키워드 토큰 상한.
 * 선행 와일드카드 LIKE(`%kw%`)는 인덱스를 못 타므로 토큰 수가 그대로 full scan 비용이 된다.
 * keyword 는 100자 제한이라 이론상 50토큰까지 들어올 수 있어 상한을 둔다.
 */
export const KEYWORD_TOKEN_LIMIT = 10;

/**
 * 본문(`body`) 검색 스위치 — **검색 고도화로 꺼졌다**.
 *
 * 2026-10-12 결정: 검색 대상은 제목 + 첨부파일명 + 형번. 자동완성과 본검색 어느 쪽에서도
 * 본문을 보지 않는다(자동완성 응답속도). 목업도 같은 방식으로 `SEARCH_BODY = false` 플래그를
 * 두고 본문 분기를 남겨 둔다(01-search.html).
 *
 * ⚠️ 요구사항정의서 REQ-001 은 본문을 검색 대상에 포함한다 — **고객 합의가 필요한 차이**다.
 * 되살릴 때는 이 상수만 `true` 로 바꾸면 Prisma 조건과 raw SQL 분기가 함께 복구된다.
 */
// 타입을 boolean 으로 고정해, 끄고 켤 때 분기가 죽은 코드로 좁혀지지 않게 한다.
export const SEARCH_BODY: boolean = false;

/**
 * 검색어를 공백 기준으로 토큰 분리 — 연속 공백은 구분자 하나로 처리한다.
 * JS `\s` 는 전각 공백(U+3000)도 포함하므로 일본어 입력 환경을 그대로 커버한다.
 */
export function tokenizeKeyword(keyword: string | undefined): string[] {
  if (!keyword) return [];
  return keyword.split(/\s+/).filter(Boolean).slice(0, KEYWORD_TOKEN_LIMIT);
}

/**
 * LIKE 패턴 메타문자 이스케이프 — `%`(임의 길이) · `_`(한 글자) · `\`(이스케이프 문자).
 *
 * 검색어를 그대로 `LIKE '%…%'` 에 넣으면 사용자가 입력한 `%`·`_` 가 와일드카드로 해석된다.
 *   - `100%` → `100` 으로 **시작하는 모든 자료**가 걸린다 (「変換効率100%」 같은 표기 검색이 틀어진다)
 *   - `Q.TRON_1` → `Q.TRON01`·`Q.TRONA1` 까지 걸린다
 *   - `%` 한 글자 → 전 자료. 실시간 경로는 3자 게이트가 막지만 Enter 는 통과한다
 *
 * 값 바인딩이라 SQL 주입은 성립하지 않는다 — **검색 결과가 틀리는** 문제다.
 *
 * ⚠️ 토큰 **원본은 그대로 두고** LIKE 패턴을 만드는 지점에서만 적용한다. 관련도 정렬의
 * `hasTitleMatch` 는 JS 문자열 비교라, 이스케이프된 토큰을 넘기면 매칭이 어긋난다.
 *
 * ⚠️ 이스케이프 문자는 `\` 이고, 이는 MariaDB **기본 sql_mode** 를 전제한다. raw SQL 분기는
 * `ESCAPE` 절로 그 문자를 명시하고, Prisma `contains` 는 ESCAPE 절을 넣을 수 없어 DB 기본값에
 * 기댄다 — 어느 쪽도 sql_mode 와 무관하지는 않다.
 *
 * `NO_BACKSLASH_ESCAPES` 를 켜면 **양쪽이 서로 다르게 깨진다**: Prisma 쪽은 `\` 가 평범한
 * 글자가 되어 이스케이프가 무효가 되고, raw SQL 쪽은 `ESCAPE '\\'` 가 2문자 인수가 되어
 * 거부된다(2026-10-29 실측: `ER_WRONG_ARGUMENTS` 1210). 그 모드가 필요해지면 이 함수의
 * 이스케이프 문자와 raw SQL 의 `ESCAPE` 인수를 함께 바꿔야 한다.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 자료(콘텐츠) 키워드 조건 — **제목만**(+ 본문은 `SEARCH_BODY` 시).
 *
 * 요구사항정의서 v1.1 REQ-001:
 *   「검색어 입력 및 변경 시 **제품 형번과 콘텐츠 제목**을 대상으로 검색 결과를 실시간 갱신한다」
 *   「콘텐츠 내용 및 첨부파일명을 대상으로 하는 부분일치 검색(Like 검색)은 제거한다」
 *
 * ⚠️ **「제품 형번과 콘텐츠 제목」은 대상별로 하나씩이다.** 제품은 형번, 자료는 제목이다 —
 * 한 검색 안에서 둘을 OR 로 묶는다는 뜻이 아니다(2026-11-03 사용자 확정). 형번관리에서
 * **형번 자체가 제품의 제목**이므로, 양쪽 모두 「자기 제목만 본다」로 같다.
 *
 * 종전에는 여기에 `productModels.modelCode` 분기가 있어, **자료에 연결된 형번으로 그 자료가
 * 끌려 나왔다.** 제품일람도 이 함수를 써서 자료 제목으로 제품이 걸렸고, `435` 검색 시 형번에
 * 435 가 없는 제품 4건이 섞여 나왔다 (Redmine #2760·#2748).
 * 제품(형번) 쪽 조건은 `buildModelCodeCondition` 이 따로 만든다.
 *
 * 토큰 결합은 **필드 단위**다. AND 는 "한 필드 안에 모든 토큰" 이지 필드를 넘나들지 않는다.
 *
 * ⚠️ `/api/contents` GET 의 `sortCategoryCode` 분기는 같은 조건을 raw SQL 로 다시 쓴다.
 *    한쪽만 고치면 카테고리 정렬 상태에서 검색 결과가 달라진다 — 함께 유지할 것.
 *
 * @returns 토큰이 없으면 `undefined` (where 절에 키워드 조건을 얹지 않음)
 */
export function buildKeywordCondition(
  tokens: string[],
  keywordOp: "AND" | "OR",
): Prisma.ContentWhereInput | undefined {
  if (tokens.length === 0) return undefined;

  // 사용자가 입력한 `%`·`_` 가 와일드카드로 해석되지 않도록 패턴을 이스케이프한다.
  const patterns = tokens.map(escapeLikePattern);

  if (keywordOp === "AND") {
    return {
      OR: [
        { AND: patterns.map((t) => ({ title: { contains: t } })) },
        ...(SEARCH_BODY ? [{ AND: patterns.map((t) => ({ body: { contains: t } })) }] : []),
      ],
    };
  }

  return {
    OR: [
      ...patterns.map((t) => ({ title: { contains: t } })),
      ...(SEARCH_BODY ? patterns.map((t) => ({ body: { contains: t } })) : []),
    ],
  };
}

/**
 * 제품(형번) 키워드 조건 — **형번명(`modelCode`)만**.
 *
 * 형번관리에서 형번 자체가 제품의 제목이다. 그래서 제품일람 검색은 형번명만 본다 —
 * 자료 제목은 보지 않는다 (요구사항정의서 v1.1 REQ-001, 2026-11-03 사용자 확정).
 * 자동완성 `[제품]` 후보(`/api/search/suggest`)도 같은 **필드**(`modelCode`)를 본다 —
 * 갈라지면 「자동완성 2건인데 목록 6건」이 된다 (Redmine #2760).
 *
 * 토큰화도 같다 — 자동완성이 입력 전체를 한 덩어리 LIKE 로 쓰던 것을 고쳐, 이제 같은
 * `tokenizeKeyword` + `keywordOp` 를 쓴다 (Redmine #2751).
 *
 * ⚠️ 한 가지만 다르다: 자동완성은 **나눈 단어마다** 3자 게이트를 걸어 2자 이하 단어를 버린다
 * (2026-11-11 사용자 확정). 목록은 전체 검색어만 3자로 끊는다. 그래서 `Q.TRON TE` 처럼 2자
 * 단어가 섞인 입력에서는 후보와 목록의 건수가 다를 수 있다 — 의도된 차이다.
 *
 * 노출 제어(`isVisible`·카테고리)는 `productModelVisibilityFilter` 가 따로 건다 —
 * 여기서는 키워드만 만든다.
 *
 * @returns 토큰이 없으면 `undefined`
 */
export function buildModelCodeCondition(
  tokens: string[],
  keywordOp: "AND" | "OR",
): Prisma.ProductModelWhereInput | undefined {
  if (tokens.length === 0) return undefined;
  const patterns = tokens.map(escapeLikePattern);
  return keywordOp === "AND"
    ? { AND: patterns.map((t) => ({ modelCode: { contains: t } })) }
    : { OR: patterns.map((t) => ({ modelCode: { contains: t } })) };
}

/**
 * 제목 매칭 여부 — 관련도 정렬의 유일한 가중 요소.
 *
 * 목업 `scoreDocTerm()` 은 제목 52점 / 본문 22점으로 점수를 매긴다. 본문이 검색 대상에서
 * 빠진 뒤로는 "제목에 맞았는지" 가 사실상 유일한 변별 요소라, 서버에서는 제목 매칭을
 * 상위로 올리고 동점은 갱신일 내림차순으로 처리한다 — 추가 쿼리 없이 1단계에서 받은
 * 제목 문자열만으로 계산된다.
 *
 * 목업의 동의어·표기흔들림 보정(`SYNONYMS` / `expandQuery`)은 구현하지 않았다.
 * 사전을 어디에 두고 누가 관리하는지가 정해지지 않은 별건이다.
 */
export function hasTitleMatch(
  title: string,
  tokens: string[],
  keywordOp: "AND" | "OR",
): boolean {
  if (tokens.length === 0) return false;
  const lowered = title.toLowerCase();
  const matches = tokens.map((t) => lowered.includes(t.toLowerCase()));
  return keywordOp === "AND" ? matches.every(Boolean) : matches.some(Boolean);
}

/**
 * 비사내 공개 경로의 검색 rate limit — DB 부하 방지 (IP당 60회/분, IP 불명 시 20회/분).
 *
 * 대상은 인덱스로 값싸게 처리되지 않는 경로다. 키워드 검색은 제목(자료)·형번명(제품)에
 * 선행 와일드카드 LIKE 를 걸고 findMany 와 count 가 각각 평가하므로, 불일치 검색어를
 * 반복해도 매번 full 비용이 든다.
 *
 * 쿼리 실행 **전에** 호출한다 — 차단 대상 요청이 DB 를 한 번도 건드리지 않아야 의미가 있다.
 *
 * @param scope rate limit 키 접두사. 경로별로 분리해 한 경로의 폭주가 다른 경로를 막지 않게 한다
 * @returns 차단 시 429 응답, 통과 시 `null`
 */
export function checkSearchRateLimit(
  request: NextRequest,
  scope: string,
  userId: string | null,
): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const key = ip ? `${scope}:${ip}` : `${scope}:user:${userId ?? "anon"}`;
  const limit = ip ? 60 : 20;

  if (checkRateLimit(key, limit, 60_000)) return null;

  return NextResponse.json(
    { error: "リクエストが多すぎます。しばらくしてから再試行してください。" },
    { status: 429 },
  );
}
