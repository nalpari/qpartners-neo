// 전체 E2E 실행 — `node scripts/e2e/run-all.mjs`
//
// 스펙 파일은 각자 독립 프로세스로 돌린다. 하나가 브라우저를 물고 죽어도 나머지가 계속되고,
// 실패한 스펙만 따로 다시 돌릴 수 있다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const specs = fs
  .readdirSync(here)
  .filter((f) => f.endsWith(".e2e.mjs"))
  .sort();

if (specs.length === 0) {
  console.error("실행할 스펙이 없습니다 (*.e2e.mjs)");
  process.exit(1);
}

let failed = 0;
for (const spec of specs) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, spec)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", resolve);
  });
  if (code !== 0) failed += 1;
}

console.log(`\n==== 스펙 ${specs.length}개 중 실패 ${failed}개 ====`);
process.exit(failed > 0 ? 1 : 0);
