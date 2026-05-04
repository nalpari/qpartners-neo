/**
 * 본문 HTML에서 사용 중인 inline-image ID 집합 추출.
 *
 * `<img src="/api/inline-images/{id}" ...>` 형태만 매칭한다. 우측 경계는 `(?=["'\s>])` —
 * 인용부호/공백/태그 종료 직전. `?query` 나 `#hash` 가 붙은 src 는 `sanitize-html` 의
 * `SAFE_IMG_SRC_PATTERN` (`\/api\/inline-images\/\d+$`) 에서 차단되므로 본문에 살아남지 않는다 →
 * 추출 단계도 동일 정책으로 좁혀 stamp/본문 불일치(좀비 stamp)를 차단.
 *
 * 두 패턴은 한 묶음 정책 — sanitize-html.ts:SAFE_IMG_SRC_PATTERN 과 함께만 변경할 것.
 */
const INLINE_IMAGE_ID_PATTERN = /\/api\/inline-images\/(\d+)(?=["'\s>])/g;

export function extractInlineImageIds(
  body: string | null,
): Set<number> {
  if (!body) return new Set();
  const ids = new Set<number>();
  for (const match of body.matchAll(INLINE_IMAGE_ID_PATTERN)) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}
