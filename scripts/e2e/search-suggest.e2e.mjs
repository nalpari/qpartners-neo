// 통합검색 자동완성 — REQ-001 / 목업 `01-search.html:530` · `updateSuggest()`.
//
// 서버(`GET /api/search/suggest`)가 3자 게이트·노출범위·종류별 건수를 판정하고,
// 화면은 받은 것을 그대로 그린다. 여기서는 **화면 동작**만 본다.
//
// 대기 원칙 (2026-10-27):
//   - 진입은 `enter()` — `openContents` 가 `domcontentloaded` 로 끝나므로 **첫 조회 응답으로
//     하이드레이션을 확인**한 뒤에 조작한다. 그 전에 클릭하면 React 가 붙지 않아 아무 일도
//     일어나지 않는다.
//   - 후보가 **떠야 하는** 케이스는 `typeAndSuggest` — suggest 응답과 드롭다운 렌더를 기다린다.
//   - 후보가 **뜨면 안 되는** 케이스(2자 게이트, 적중 0건, 진입 직후)는 기다릴 대상이 없으므로
//     고정 대기를 **의도적으로** 쓴다.
//   - 이동을 확인하는 케이스는 `waitForURL` 로 기다린다 — 고정 대기로는 이동 전 URL 을 읽는다.

import {
  assert,
  assertEqual,
  BASE_URL,
  openContents,
  RESULT_TOTAL,
  run,
  SEARCH_INPUT,
  SUGGEST_BOX,
  test,
  waitForTotal,
  withPage,
} from "./harness.mjs";

/** 「일어나지 않아야 한다」를 확인할 때만 쓰는 고정 대기 — 디바운스(350ms)보다 넉넉히. */
const NO_CALL_SETTLE_MS = 2_500;
const SUGGEST_API = /\/api\/search\/suggest/;

/** 진입 — 첫 조회 응답까지 기다려 하이드레이션을 보장한다. */
async function enter(page, query = "") {
  const first = page
    .waitForResponse((r) => /\/api\/(contents|products)\?/.test(r.url()), { timeout: 60_000 })
    .catch(() => null);
  await openContents(page, query);
  await page.waitForSelector(RESULT_TOTAL, { timeout: 40_000 });
  await first;
}

/**
 * 검색어를 넣고 자동완성이 그려질 때까지 기다린다.
 *
 * `expectBox: false` 면 드롭다운을 기다리지 않고 **응답까지만** 기다린다 — 적중 0건처럼
 * 응답은 오지만 드롭다운이 뜨지 않아야 하는 경우에 쓴다.
 */
async function typeAndSuggest(page, text, { expectBox = true } = {}) {
  const answered = page
    .waitForResponse((r) => SUGGEST_API.test(r.url()), { timeout: 25_000 })
    .catch(() => null);
  const input = page.locator(SEARCH_INPUT);
  await input.click();
  await input.type(text, { delay: 40 });
  await answered;
  if (expectBox) {
    await page
      .locator(SUGGEST_BOX)
      .waitFor({ timeout: 20_000 })
      .catch(() => null);
    await page
      .locator('[role="option"]')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => null);
  }
}

/** 후보가 `[製品]` 먼저, `[資料]` 나중에 오는지 — 목업의 표시 순서 규칙. */
async function readKinds(page) {
  return page.locator('[role="option"] span').evaluateAll((nodes) =>
    nodes.map((n) => n.textContent).filter((t) => t === "製品" || t === "資料"),
  );
}

/** 드롭다운이 닫힐 때까지 기다린다. 닫히지 않으면 호출자의 단언이 잡는다. */
async function waitClosed(page, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await page.locator(SUGGEST_BOX).count()) === 0) return;
    await page.waitForTimeout(150);
  }
}

test("3자 이상 입력하면 후보가 [製品] → [資料] 순으로 뜬다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");

    assertEqual(await page.locator(SUGGEST_BOX).count(), 1, "드롭다운이 열리지 않았습니다");
    const kinds = await readKinds(page);
    assert(kinds.length > 0, "후보가 0건입니다");
    assert(kinds.includes("製品"), "제품 후보가 없습니다");
    const lastProduct = kinds.lastIndexOf("製品");
    const firstDoc = kinds.indexOf("資料");
    assert(
      firstDoc === -1 || lastProduct < firstDoc,
      `[製品] 뒤에 [資料] 가 와야 합니다 — 실제 순서 ${kinds.join(",")}`,
    );
  });
});

test("2자 이하는 자동완성 요청을 보내지 않는다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const calls = [];
    page.on("request", (r) => {
      if (SUGGEST_API.test(r.url())) calls.push(r.url());
    });
    await enter(page);

    // 요청이 **나가지 않아야** 하므로 기다릴 응답이 없다 — 고정 대기가 맞다.
    await page.locator(SEARCH_INPUT).click();
    await page.locator(SEARCH_INPUT).type("Q.", { delay: 60 });
    await page.waitForTimeout(NO_CALL_SETTLE_MS);

    assertEqual(calls.length, 0, `2자 입력에 요청이 나갔습니다: ${calls.join(" | ")}`);
    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "2자인데 드롭다운이 열렸습니다");
  });
});

test("적중 0건이면 드롭다운을 띄우지 않는다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    // 응답은 오지만 드롭다운은 뜨지 않아야 한다 — 응답까지만 기다린 뒤 짧게 확인한다.
    await typeAndSuggest(page, "zzzzzzzz", { expectBox: false });
    await page.waitForTimeout(1_000);

    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "후보 0건인데 드롭다운이 떴습니다");
  });
});

test("제품 후보를 누르면 제품상세로 간다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");
    assert((await page.locator('[role="option"]').count()) > 0, "선행 조건 불성립 — 후보 0건");

    await page.locator('[role="option"]').first().click();
    // 이동을 기다린다 — 고정 대기로는 이동 전 URL 을 읽어 「이동 실패」로 오판한다.
    await page.waitForURL(/\/products\/\d+/, { timeout: 25_000 }).catch(() => null);

    const url = page.url().replace(BASE_URL, "");
    assert(/^\/products\/\d+/.test(url), `제품상세로 가지 않았습니다 — ${url}`);
  });
});

test("바깥을 클릭하면 닫힌다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");
    assertEqual(await page.locator(SUGGEST_BOX).count(), 1, "선행 조건 불성립 — 드롭다운 미표시");

    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await waitClosed(page);
    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "바깥 클릭에도 닫히지 않았습니다");
  });
});

test("검색어를 들고 진입해도 포커스 전에는 조회하지 않는다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const calls = [];
    page.on("request", (r) => {
      if (SUGGEST_API.test(r.url())) calls.push(r.url());
    });
    await enter(page, "?keyword=Q.TRON");

    // 진입만으로는 요청이 없어야 한다 — 부정 확인이므로 고정 대기.
    await page.waitForTimeout(NO_CALL_SETTLE_MS);
    assertEqual(calls.length, 0, `진입만으로 요청이 나갔습니다: ${calls.join(" | ")}`);
    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "진입만으로 드롭다운이 열렸습니다");

    await page.locator(SEARCH_INPUT).click();
    await page.waitForSelector(SUGGEST_BOX, { timeout: 20_000 });
    assertEqual(calls.length, 1, `포커스 후 요청이 1건이 아닙니다: ${calls.length}`);
  });
});

test("Escape 로 닫힌다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");
    assertEqual(await page.locator(SUGGEST_BOX).count(), 1, "선행 조건 불성립 — 드롭다운 미표시");

    // 드롭다운이 탭·목록 위를 덮으므로, 바깥 클릭이 곧 후보 클릭이 되는 자리가 있다.
    // 의도치 않은 이동 없이 닫을 수단이 반드시 필요하다.
    await page.keyboard.press("Escape");
    await waitClosed(page);
    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "Escape 로 닫히지 않았습니다");
  });
});

test("Escape 로 닫은 뒤에도 검색어와 목록은 그대로다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    // 이 검색어는 실시간 목록 검색까지 유발한다 — 건수가 안정된 뒤에 기준값을 잡아야 한다.
    await typeAndSuggest(page, "PHASE9-TEST", { expectBox: false });
    const totalBefore = await waitForTotal(page);
    assert(totalBefore !== null, "비교 기준이 될 건수를 읽지 못했습니다");

    await page.keyboard.press("Escape");
    await waitClosed(page);

    assertEqual(
      await page.locator(SEARCH_INPUT).inputValue(),
      "PHASE9-TEST",
      "Escape 가 입력값을 지웠습니다",
    );
    assertEqual(await waitForTotal(page), totalBefore, "Escape 가 목록을 되돌렸습니다");
  });
});

test("비로그인도 자동완성이 동작한다", async () => {
  await withPage({ role: null }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Re.RISE");
    assert((await page.locator('[role="option"]').count()) > 0, "비로그인 후보가 0건입니다");
  });
});

test("드롭다운이 listbox/option 역할을 갖는다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");

    assertEqual(await page.locator(SUGGEST_BOX).count(), 1, "listbox 가 없습니다");
    assert((await page.locator('[role="option"]').count()) > 0, "option 이 없습니다");
  });
});

// ── 키보드 조작 (2026-10-13 사용자 요청) ─────────────────────────────────
// ↓/↑ 로 후보를 고르고 Enter 로 그 상세로 이동한다. 아무것도 고르지 않은 채 Enter 를 누르면
// 종전대로 **그 검색어로 목록을 조회**한다.

/** 현재 선택된 후보의 인덱스 (없으면 -1) */
async function activeIndex(page) {
  return page
    .locator('[role="option"]')
    .evaluateAll((nodes) => nodes.findIndex((n) => n.getAttribute("aria-selected") === "true"));
}

test("↓ 로 후보를 차례로 고른다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");
    assert((await page.locator('[role="option"]').count()) >= 2, "후보가 2개 이상 필요합니다");

    assertEqual(await activeIndex(page), -1, "처음부터 선택돼 있습니다");
    await page.keyboard.press("ArrowDown");
    assertEqual(await activeIndex(page), 0, "↓ 1회 후 첫 후보가 선택되지 않았습니다");
    await page.keyboard.press("ArrowDown");
    assertEqual(await activeIndex(page), 1, "↓ 2회 후 두 번째가 선택되지 않았습니다");
    await page.keyboard.press("ArrowUp");
    assertEqual(await activeIndex(page), 0, "↑ 로 되돌아가지 않았습니다");
  });
});

test("고른 뒤 Enter 를 누르면 그 후보로 이동한다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/(products|contents)\/\d+/, { timeout: 25_000 }).catch(() => null);

    const url = page.url().replace(BASE_URL, "");
    assert(/^\/(products|contents)\/\d+/.test(url), `후보로 이동하지 않았습니다 — ${url}`);
  });
});

test("고르지 않은 채 Enter 를 누르면 그 검색어로 조회한다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");

    await page.keyboard.press("Enter");
    await waitClosed(page);
    // 이동이 **일어나지 않아야** 한다 — 잠깐 더 두고 URL 을 확인한다.
    await page.waitForTimeout(1_500);

    assertEqual(page.url().replace(BASE_URL, ""), "/contents", "검색이 아니라 이동이 일어났습니다");
    assertEqual(await page.locator(SUGGEST_BOX).count(), 0, "Enter 후 드롭다운이 남아 있습니다");
  });
});

test("타이핑을 이어가면 선택이 풀린다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await enter(page);
    await typeAndSuggest(page, "Q.TRON");
    await page.keyboard.press("ArrowDown");
    assertEqual(await activeIndex(page), 0, "선행 조건 불성립");

    // 이어 타이핑하면 suggest 가 다시 조회된다 — 그 응답까지 기다린 뒤 판정한다.
    const answered = page
      .waitForResponse((r) => SUGGEST_API.test(r.url()), { timeout: 25_000 })
      .catch(() => null);
    await page.locator(SEARCH_INPUT).type(" M", { delay: 50 });
    await answered;

    assertEqual(await activeIndex(page), -1, "타이핑 후에도 선택이 남아 있습니다");
  });
});

process.exitCode = (await run("통합검색 자동완성")) > 0 ? 1 : 0;
