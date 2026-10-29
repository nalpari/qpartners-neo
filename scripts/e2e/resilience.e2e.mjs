// 조회 실패 시의 화면 — 「조용히 틀린 값」을 보여주지 않는다.
//
// 2026-10-13 사용자 보고(피드백 7·8). DB 연결이 잠깐 끊긴 구간에
//   - 건수 select 가 `-` 로 고착 (`PAGE_SIZE` 공통코드 조회 실패)
//   - `合計 0件` / `Total 0` 표시 (목록 조회 실패)
// 둘 다 **오류 표시도 복구 수단도 없어** 새로고침 외에는 방법이 없었다.
//
// 요구:
//   1. 건수 select 는 실패를 구분해 **재시도 수단**을 준다 (운영자 미등록 상태의 `-` 와 구분)
//   2. 목록 조회가 실패하면 건수는 **`-`** 다. `0` 은 "0건 검색됨"과 구분되지 않는다

import {
  assert,
  assertEqual,
  BASE_URL,
  openContents,
  openDocContents,
  run,
  test,
  withPage,
} from "./harness.mjs";

const SETTLE = 2_000;
const PAGE_SIZE_RETRY = '[data-testid="page-size-retry"]';
const RESULT_TOTAL = '[data-testid="result-total"]';

/**
 * 「실패 표시가 떴는가」를 고정 대기로 확인하면 안 된다.
 *
 * 조회를 abort 시킨 케이스라 기다릴 응답이 없고, 실패 처리는 TanStack Query 의 재시도·백오프를
 * 거쳐 나타나므로 **언제 뜰지 모른다**. 고정 대기(4초)로는 아직 안 뜬 상태를 읽어 「실패인데
 * 재시도 수단이 없다」로 오판한다(2026-10-27 실측 — 같은 요구를 검증하는 다음 케이스는
 * `waitForSelector` 를 써서 통과하고 있었다).
 *
 * 그래서 「그 표시가 될 때까지」 폴링하고, 기한을 넘기면 마지막으로 본 값으로 실패시킨다.
 */
async function waitForText(page, selector, expected, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    const el = page.locator(selector);
    if ((await el.count()) > 0) {
      last = (await el.first().innerText()).trim();
      if (last === expected) return last;
    }
    await page.waitForTimeout(250);
  }
  return last;
}

test("PAGE_SIZE 조회가 실패하면 재시도 수단이 보인다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await page.route("**/api/codes/lookup**", (r) => r.abort());
    await openContents(page);
    await page.waitForSelector(RESULT_TOTAL, { timeout: 40_000 });

    // 재시도 버튼은 쿼리 재시도·백오프 뒤에 뜬다 — 나타날 때까지 기다린다.
    await page
      .waitForSelector(PAGE_SIZE_RETRY, { timeout: 30_000 })
      .catch(() => null);

    assertEqual(
      await page.locator(PAGE_SIZE_RETRY).count(),
      1,
      "조회 실패인데 재시도 수단이 없습니다 (조용히 `-` 로 끝남)",
    );
  });
});

test("재시도를 누르면 복구된다", async () => {
  await withPage({ role: "super" }, async (page) => {
    let block = true;
    await page.route("**/api/codes/lookup**", (r) => (block ? r.abort() : r.continue()));
    await openContents(page);
    await page.waitForSelector(PAGE_SIZE_RETRY, { timeout: 40_000 });

    block = false;
    await page.locator(PAGE_SIZE_RETRY).click();
    await page.waitForSelector(PAGE_SIZE_RETRY, { state: "detached", timeout: 20_000 });

    // 버튼이 사라진 직후에는 select 가 막 마운트된 참이라 라벨이 비어 있을 수 있다.
    // 고정 대기 대신 라벨이 채워질 때까지 기다린다.
    await page
      .locator('[data-testid="page-size-select"]')
      .filter({ hasText: /20|50|100/ })
      .waitFor({ timeout: 20_000 });
    const label = await page.locator('[data-testid="page-size-select"]').innerText();
    assert(/20|50|100/.test(label), `복구 후 건수가 보이지 않습니다 — "${label.trim()}"`);
  });
});

test("운영자가 PAGE_SIZE 를 등록하지 않은 상태는 재시도를 띄우지 않는다", async () => {
  await withPage({ role: "super" }, async (page) => {
    // 정상 응답이지만 목록이 빈 경우 = 설정 누락. 오류가 아니므로 `-` 로 두고 재시도를 권하지 않는다.
    await page.route("**/api/codes/lookup**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await openContents(page);
    await page.waitForSelector(RESULT_TOTAL, { timeout: 40_000 });
    await page.waitForTimeout(SETTLE);

    assertEqual(
      await page.locator(PAGE_SIZE_RETRY).count(),
      0,
      "설정 누락인데 재시도 수단이 떴습니다",
    );
  });
});

test("목록 조회가 실패하면 건수는 0 이 아니라 - 다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await page.route("**/api/contents?*", (r) => r.abort());
    // 기본 탭은 제품일람이라 `/api/products` 만 돈다 — 자료 조회가 일어나지 않아
    // abort 가 아무 효과도 내지 못한다. 자료일람 탭으로 옮겨야 이 요구를 검증할 수 있다.
    await openDocContents(page, "", SETTLE * 2);
    await page.waitForTimeout(SETTLE * 2);

    const shown = (await page.locator(RESULT_TOTAL).innerText()).trim();
    assertEqual(shown, "-", `실패했는데 "${shown}" 로 보입니다 — 0 은 "0건 검색됨"과 구분되지 않습니다`);
  });
});

test("형번관리도 조회 실패 시 Total 이 - 다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await page.route("**/api/product-models?*", (r) => r.abort());
    await page.goto(`${BASE_URL}/admin/product-models`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForSelector('[data-testid="product-models-total"]', { timeout: 40_000 });

    // 로딩 중 잠깐 `0` 으로 보일 수 있으므로 `-` 가 될 때까지 기다린다.
    const shown = await waitForText(page, '[data-testid="product-models-total"]', "-");
    assertEqual(shown, "-", `실패했는데 "${shown}" 로 보입니다`);
  });
});

process.exitCode = (await run("조회 실패 시 화면")) > 0 ? 1 : 0;
