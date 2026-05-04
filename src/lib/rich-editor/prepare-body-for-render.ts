/**
 * 상세 페이지 본문 렌더 직전 전처리.
 *
 * 레거시 plain-text의 줄바꿈(\n)을 <br>로 변환해 시각적 줄바꿈을 보존한다.
 * BlockNote 출력 HTML은 이미 <p> 단위로 분리되어 있어 영향이 없다.
 *
 * sanitize는 별도 책임이다 — 결과를 반드시 sanitizeContentHtml에 통과시킨 뒤 렌더해야 한다.
 */
export function prepareBodyForRender(body: string | null | undefined): string {
  if (!body) return "";
  return body.replace(/\n/g, "<br>");
}
