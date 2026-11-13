// 실시간 리스트 검색 — REQ-001 / 2026-10-12 고객 메일 「5) 텍스트 검색: 검색 범위」.
//
// 메일은 검색범위를 **트레이드오프**로 제시했다:
//   - 제목만 검색      → 실시간 리스트 검색 **적용 가능**
//   - 내용까지 포함    → 실시간 리스트 검색 **제외**
// 우리는 본문 제외(계획서 §5-①)를 택했으므로 실시간 쪽을 가져와야 한다.
// 목업 구현은 `01-search.html` 의 `runSearchDebounced()` — `SEARCH_BODY=false` 라 가드를 통과한다.
//
// 3자 미만으로 지우면 **초기화**다 — 목록은 전체, 좌측 체크는 **전체 해제** (2026-11-05 확정,
// 2026-11-12 회의로 「전체 선택」에서 「전체 해제」로 변경 — 화면 첫 진입과 같은 상태).
// 3자 미만은 자동완성도 검색어 조건도 빠지는 구간이라 「검색하기 전」과 같은 상태이기 때문이다.
//
// 대기 원칙 (2026-10-27):
//   - **조회가 일어나야 하는 조작**은 `actAndWait` 로 응답을 기다린다. 고정 대기를 쓰면 디바운스
//     350ms + API 2.4~2.9초가 대기(2.5초)를 넘겨 **조회 전 값**을 읽는다 — 실행마다 결과가 달라진다.
//   - **조회가 일어나면 안 되는 조작**(2자 이하 게이트, 디바운스 횟수)은 기다릴 응답이 없으므로
//     고정 대기를 **의도적으로** 쓴다. 이 둘을 섞지 않는다.

import {
  actAndWait,
  assert,
  assertEqual,
  domClick,
  openDocContents,
  RESULT_TOTAL,
  run,
  SEARCH_INPUT,
  test,
  waitForStableNumber,
  withPage,
} from "./harness.mjs";

/** 「조회가 나가지 않아야 한다」를 확인할 때만 쓰는 고정 대기 — 디바운스(350ms)보다 넉넉히. */
const NO_CALL_SETTLE_MS = 3_000;

/** 검색어를 입력하고 목록 조회가 끝날 때까지 기다린다. */
function typeAndWait(page, text) {
  return actAndWait(page, async () => {
    const input = page.locator(SEARCH_INPUT);
    await input.click();
    await input.type(text, { delay: 40 });
  });
}

test("3자 이상 입력하면 Enter 없이 목록이 걸러진다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const before = await openDocContents(page);
    assert(before !== null && before > 0, `초기 건수를 읽지 못했습니다 (${before})`);

    const after = await typeAndWait(page, "PHASE9-TEST");
    assert(
      after !== null && after < before,
      `Enter 없이 목록이 걸러지지 않았습니다 — 전 ${before} / 후 ${after}`,
    );
  });
});

test("2자 이하는 실시간 조회를 보내지 않는다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const listCalls = [];
    page.on("request", (r) => {
      const url = r.url();
      if (url.includes("/api/contents?") && url.includes("keyword=")) listCalls.push(url);
    });
    await openDocContents(page);

    // 조회가 **나가지 않아야** 하므로 기다릴 응답이 없다 — 고정 대기가 맞다.
    await page.locator(SEARCH_INPUT).click();
    await page.locator(SEARCH_INPUT).type("PH", { delay: 60 });
    await page.waitForTimeout(NO_CALL_SETTLE_MS);

    assert(
      listCalls.length === 0,
      `2자 입력에 목록 조회가 나갔습니다 (${listCalls.length}건): ${listCalls.join(" | ")}`,
    );
  });
});

/** 요청 URL 들에서 **마지막** `facetCategoryIds` 값을 정렬해 돌려준다. 없으면 null. */
function lastFacetParam(urls) {
  for (const u of [...urls].reverse()) {
    const m = /[?&]facetCategoryIds=([^&]*)/.exec(u);
    if (m) return m[1].split(",").filter(Boolean).sort().join(",");
  }
  return null;
}

/** 집계 전용 호출(`facets=true`)을 제외한 목록 조회만 남긴다. */
function listCallsOnly(urls) {
  return urls.filter((u) => !/[?&]facets=true(&|$)/.test(u));
}

test("3자 미만으로 지우면 전체 조회로 초기화된다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const calls = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("/api/contents?")) calls.push(decodeURIComponent(u));
    });
    const initial = await openDocContents(page);

    const filtered = await typeAndWait(page, "PHASE9-TEST");
    assert(filtered !== null && filtered < initial, `선행 조건 불성립 — ${initial} → ${filtered}`);
    calls.length = 0;

    // 3자 미만은 **검색이 없던 상태**다 — 자동완성도 검색어 조건도 빠지는 구간이라, 남는 것은
    // 검색하기 전 화면이다. 그래서 「직전 조건으로 재조회」가 아니라 **초기화**다
    // (2026-11-05 사용자 확정). 종전에는 체크를 그대로 두고 그 기준으로 재조회했는데,
    // 검색이 만든 체크가 더 이상 조건이 아니게 되면서(#2748) 「검색은 취소됐는데 그 검색이
    // 만든 체크로 거르는」 상태가 되어 뒤집었다.
    await page.locator(SEARCH_INPUT).fill("PH");
    const restored = await waitForStableNumber(page, RESULT_TOTAL);

    assertEqual(restored, initial, "2자 이하로 지웠는데 전체 건수로 돌아오지 않았습니다");

    // 조회가 나갔다면 검색어도 분류축도 실려 있으면 안 된다. 초기 상태와 같은 쿼리라
    // 캐시로 처리되어 **요청이 없을 수도** 있다 — 있을 때만 본다.
    const reQuery = listCallsOnly(calls).at(-1);
    if (reQuery !== undefined) {
      assert(!/[?&]keyword=[^&]/.test(reQuery), `재조회에 검색어가 남아 있습니다 — ${reQuery}`);
      assertEqual(lastFacetParam([reQuery]), null, "초기화 조회에 분류축 조건이 실렸습니다");
    }
  });
});

test("3자 미만으로 지우면 좌측 체크도 전체 해제로 돌아간다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await openDocContents(page);

    const countChecked = () =>
      page.$$eval('aside input[type="checkbox"]', (boxes) => {
        const usable = boxes.filter((b) => !b.disabled);
        return { on: usable.filter((b) => b.checked).length, all: usable.length };
      });

    const onOpen = await countChecked();
    assert(onOpen.all > 0, "좌측영역 체크박스를 찾지 못했습니다");
    assertEqual(onOpen.on, 0, "진입 시점이 전체 해제가 아닙니다");

    await typeAndWait(page, "PHASE9-TEST");
    const narrowed = await countChecked();
    assert(
      narrowed.on > 0,
      `검색이 좌측 체크를 결과 기준으로 켜지 않았습니다 — ${narrowed.on}/${narrowed.all}`,
    );

    await page.locator(SEARCH_INPUT).fill("PH");
    await waitForStableNumber(page, RESULT_TOTAL);
    const reset = await countChecked();
    assertEqual(reset.on, 0, "2자 이하로 지웠는데 좌측 체크가 전체 해제로 돌아가지 않았습니다");
  });
});

/** 첫 분류축의 첫 선택지를 체크해 「일부 체크」 상태를 만든다 — 카테고리 명칭을 코드에 박지 않는다. */
function narrowFirstAxis(page) {
  const axis = page.locator("aside > div").filter({ has: page.locator("h2") }).first();
  return actAndWait(page, () => domClick(axis.locator('input[type="checkbox"]')));
}

test("검색어를 지우고 [검색] 하면 분류축이 전체 해제(초기)로 돌아간다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const initial = await openDocContents(page);

    const narrowed = await narrowFirstAxis(page);
    assert(
      narrowed !== null && narrowed > 0 && narrowed !== initial,
      `축을 좁히지 못해 판정이 불가능합니다 — ${initial} → ${narrowed}`,
    );

    await typeAndWait(page, "PHASE9-TEST");

    // 요구사항정의서 v1.1 REQ-004 ③ 원문은 「검색어 삭제 후 [검색] 클릭 → 검색 조건 초기화 /
    // 모든 필터 옵션 **전체 선택** / 전체 콘텐츠 표시」다. 2026-11-12 회의에서 초기 상태를
    // **전체 해제**로 정해 좌측 표시는 정의서 문구와 다르다 — 목록(전체 콘텐츠)은 같다.
    const afterSearch = await actAndWait(page, async () => {
      const input = page.locator(SEARCH_INPUT);
      await input.fill("");
      await input.press("Enter");
    });
    assertEqual(afterSearch, initial, "검색어를 지우고 [검색] 했는데 초기(전체) 건수로 돌아가지 않았습니다");
  });
});

test("디바운스 — 연속 타이핑에도 목록 조회는 1회", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const listCalls = [];
    page.on("request", (r) => {
      const url = r.url();
      if (url.includes("/api/contents?") && url.includes("keyword=")) listCalls.push(url);
    });
    await openDocContents(page);

    // 조회 **횟수**를 세는 케이스다. 첫 응답에서 멈추면 뒤따르는 2회차를 놓치므로,
    // 응답을 기다린 뒤 **추가로 더 기다려** 그 사이 아무것도 더 나가지 않음을 확인한다.
    await typeAndWait(page, "PHASE9-TEST");
    await page.waitForTimeout(NO_CALL_SETTLE_MS);

    // 디바운스는 **타이핑 횟수**를 줄이는 것이지 요청 종류를 줄이는 게 아니다.
    // 한 번의 확정 입력에서 나가는 요청은 2개다 (2026-10-28 REQ-004):
    //   ① 분류축 집계 (`facets=true`) — 체크 상태를 정하기 위해 **먼저** 묻는다
    //   ② 그 체크를 반영한 목록 조회
    // 디바운스가 깨지면 이 쌍이 글자 수만큼 반복되므로 **2회 초과**를 실패로 본다.
    assert(
      listCalls.length === 2,
      `목록 조회가 ${listCalls.length}회 나갔습니다(집계 1 + 목록 1 = 2회 기대): ${listCalls.join(" | ")}`,
    );
  });
});

test("Enter 는 글자수와 무관하게 즉시 조회를 보낸다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const calls = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("/api/contents?")) calls.push(decodeURIComponent(u));
    });
    await openDocContents(page);
    calls.length = 0;

    // 2자 — 실시간 게이트(3자)에는 걸리지만 **명시적 검색은 요청을 보낸다.**
    //
    // ⚠️ **건수로는 판정할 수 없다.** 서버 스키마(`searchKeyword`, `lib/schemas/common.ts`)가
    // 3자 미만을 조건에서 버리므로 2자 Enter 의 결과 집합은 「키워드 없음」과 같다. 게다가
    // `runSearch` 가 3자 미만 + 명시적 검색에서 좌측 체크를 전체 해제(초기)로 되돌리므로
    // 분류 조건도 같아진다 — 건수가 바뀔 수 없다.
    //
    // 종전 이 케이스는 `before !== after` 를 단언했다. PR #304(`38e42794`)가 3자 게이트를
    // 클라이언트에 통일하기 전에는 2자도 「키워드 있음」으로 보고 전건 기준 집계로 체크를
    // 덮어 건수가 움직였다. 그 커밋 이후로 **구조적으로 깨진 단언**이며 2026-11-03 E2E 실행에서
    // 드러났다(이 변경과 무관한 선행 회귀). 조회가 나갔는지로 판정을 바꾼다.
    await actAndWait(page, async () => {
      const input = page.locator(SEARCH_INPUT);
      await input.click();
      await input.type("G2", { delay: 40 });
      await page.keyboard.press("Enter");
    });

    const sent = listCallsOnly(calls);
    assert(sent.length > 0, "2자 Enter 가 목록 조회를 보내지 않았습니다");
    assert(
      /[?&]keyword=G2(&|$)/.test(sent.at(-1)),
      `2자 Enter 가 검색어를 싣지 않았습니다 — ${sent.at(-1)}`,
    );
  });
});

test("실시간 검색이 자동완성 드롭다운과 함께 동작한다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    const before = await openDocContents(page);

    // 목록 조회와 자동완성(`/api/search/suggest`)은 **별개 요청**이다. 목록 응답만 기다리면
    // 후보가 아직 안 그려졌을 수 있으므로, 드롭다운은 요소가 나타날 때까지 따로 기다린다.
    const after = await typeAndWait(page, "Q.TRON");
    await page.locator('[role="option"]').first().waitFor({ timeout: 20_000 });

    const suggestCount = await page.locator('[role="option"]').count();
    assert(suggestCount > 0, "자동완성 후보가 뜨지 않았습니다");
    assert(after !== null && after < before, `목록이 걸러지지 않았습니다 — 전 ${before} / 후 ${after}`);
  });
});

test("건수가 바뀌면 표시 요소 자체가 교체된다 (브라우저 번역 대응)", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await openDocContents(page);

    // 현재 건수 요소의 **부모 <p>** 에 표식을 남긴다. 텍스트만 갱신되면 표식이 남고,
    // key 로 요소가 교체되면 사라진다. Chrome 번역기는 교체된 요소만 다시 번역하므로
    // 이 교체가 「옛 건수와 새 건수가 겹쳐 보이는」 증상을 막는 핵심이다.
    await page.locator(RESULT_TOTAL).evaluate((el) => {
      el.closest("p").setAttribute("data-e2e-mark", "before");
    });

    await typeAndWait(page, "PHASE9-TEST");

    const stillMarked = await page
      .locator(RESULT_TOTAL)
      .evaluate((el) => el.closest("p").getAttribute("data-e2e-mark") === "before");
    assert(!stillMarked, "건수 표시 요소가 교체되지 않고 텍스트만 갱신됐습니다");
  });
});

process.exitCode = (await run("실시간 리스트 검색")) > 0 ? 1 : 0;
