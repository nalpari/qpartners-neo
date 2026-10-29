/**
 * 콘텐츠 키워드 검색 조건 — 검색기능 고도화 Phase 3.
 *
 * `/api/contents` GET 안에 있던 토큰 분리·OR 그룹 조립을 끌어내 제품일람(`/api/products`)과
 * 공유한다. 자료일람과 제품일람은 **같은 검색 결과를 축만 바꿔 보여주는 화면**이라
 * (목업 `currentResults()` 를 자료/제품 두 탭이 공유) 조건이 갈라지면 두 탭의 건수가 어긋난다.
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
 * 키워드 조건(OR 그룹) 생성 — **제목 / 형번**(+ 본문은 `SEARCH_BODY` 시).
 *
 * 첨부파일명은 **검색 대상이 아니다** — 요구사항정의서 v1.1 REQ-001 「콘텐츠 내용 및
 * 첨부파일명을 대상으로 하는 부분일치 검색(Like 검색)은 제거한다」. 목업 업무리뷰
 * 결정사항(2026-10-20)도 「본문과 첨부파일명은 대상 외」로 같다.
 *
 * 토큰 결합은 **필드 단위**다. AND 는 "한 필드 안에 모든 토큰" 이지 필드를 넘나들지 않는다.
 *   예) `사과 귤` AND → 제목에 둘 다 / 한 첨부파일명에 둘 다 / 한 형번에 둘 다 중 하나
 *       (제목에 `사과` + 형번에 `귤` 은 매칭되지 않음 — 기획 확정 사항)
 *
 * 형번 매칭은 `isVisible=true` 형번만 본다. 비표시 형번은 이용자 화면에 나타나지 않는
 * 값이므로 검색 키로도 쓰지 않는다(관리자는 형번관리 화면에서 직접 조회).
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
        {
          productModels: {
            some: {
              productModel: {
                isVisible: true,
                AND: patterns.map((t) => ({ modelCode: { contains: t } })),
              },
            },
          },
        },
      ],
    };
  }

  return {
    OR: [
      ...patterns.map((t) => ({ title: { contains: t } })),
      ...(SEARCH_BODY ? patterns.map((t) => ({ body: { contains: t } })) : []),
      {
        productModels: {
          some: {
            productModel: {
              isVisible: true,
              OR: patterns.map((t) => ({ modelCode: { contains: t } })),
            },
          },
        },
      },
    ],
  };
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
 * 대상은 인덱스로 값싸게 처리되지 않는 경로다. 키워드 검색은 제목·첨부파일명·형번에
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
