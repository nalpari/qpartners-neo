import { sanitizeContentHtml } from "./src/lib/rich-editor/sanitize-html";

const cases = [
  '<p><mark data-color="#FFD8A8" style="background-color: #FFD8A8; color: inherit">hl test</mark></p>',
  '<p><span style="color: #E03131">red text</span></p>',
  '<p><span style="color: #E03131">red</span> and <mark data-color="#A5D8FF" style="background-color: #A5D8FF; color: inherit">blue bg</mark></p>',
  // 다중 declaration 없는 형식 (혹시 Tiptap이 inherit 없이 출력하는 경우)
  '<p><mark style="background-color: #B2F2BB">green only</mark></p>',
];

for (const input of cases) {
  const out = sanitizeContentHtml(input);
  console.log("IN :", input);
  console.log("OUT:", out);
  console.log("---");
}
