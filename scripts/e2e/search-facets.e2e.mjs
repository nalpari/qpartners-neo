// 좌측영역(분류축) 필터 — 2026-11-03 회의 확정 「예외처리 3건」 모델.
//
//   ① 전부 체크(= 좌측영역 전체 선택) → `facetCategoryIds` 를 **보내지 않는다.** 분류 조건
//      없이 키워드·게시상태·권한·노출기간만 적용된 전체가 나온다 (Redmine #2747).
//   ② 전 축 전부 해제 → **조회하지 않고 0건.** 목록·총건수·페이지네이션을 함께 비운다.
//   ③ 공개 자료가 한 건도 연결되지 않은 선택지는 **조건에서 제외**(체크는 화면에 유지,
//      Redmine #2745).
//
// 그 외(일부 체크)는 종전대로 축 안 OR / 축 사이 AND 이며, **전부 해제한 축만 조건에서
// 빠진다** (계획서 §27.3, 2026-10-23 확정).
//
// ⚠️ ① 때문에 「초기 진입」과 「한 칸만 끈 상태」 사이에 **큰 건수 차이**가 있다. 조건이 걸린
// 축은 그 축에 분류가 없는 자료를 탈락시키는데, 개발 DB 는 표시 4축을 모두 가진 published
// 자료가 2,461건 중 24건뿐이다(2026-11-02 실측). 이 급락은 회의에서 **수용하기로 결정**했다 —
// 그래서 이 스펙은 「해제하면 넓어진다」를 **초기 건수와 비교하지 않는다.**
//
// ③ 은 「연결 자료 0건인 선택지」가 개발 DB 에 존재한다고 보장할 수 없어 E2E 로 고정하지
// 않는다. 근거는 `lib/content-visibility.ts#resolveFacetConditions` 주석에 있다.
//
// 이 스펙은 **절대 건수를 단언하지 않고 상대 비교만** 한다 — ② 의 0건만 예외다.
//
// 2026-10-13 의 옛 모델(초기 전부 해제 / 체크한 축만 조건)과 2026-10-23 모델(전부 체크도
// AND 조건)을 전제한 케이스를 교체했다.
//
// 카테고리 **명칭을 코드에 박지 않는다.** 폐지된 `業務分類`·`内容分類` 상수로 화면이 깨진
// 선례가 있어, 축과 선택지는 DOM 순서로 집는다.
//
// 대기는 전부 `actAndWait`/`waitForTotal` 로 한다 — 고정 대기를 쓰면 직전 값을 읽어
// 실행마다 결과가 달라진다(`harness.mjs` 주석 참조).

import {
  actAndWait,
  assert,
  assertEqual,
  BASE_URL,
  domClick,
  openDocContents,
  run,
  signToken,
  test,
  withPage,
} from "./harness.mjs";

/**
 * 분류축 블록들 — `aside` 직계 `div` 중 `h2`(축 제목)를 가진 것.
 * 형번축·관리자 전용 필터는 `section` 이므로 걸리지 않는다.
 */
function axisBlocks(page) {
  return page.locator("aside > div").filter({ has: page.locator("h2") });
}

/** 축 블록 안의 체크박스 — sr-only input */
function axisChecks(block) {
  return block.locator('input[type="checkbox"]');
}

function axisButton(page, block, name) {
  return actAndWait(page, () => domClick(block.getByRole("button", { name, exact: true })));
}

function topButton(page, name, options) {
  return actAndWait(
    page,
    () => domClick(page.getByRole("button", { name, exact: true })),
    options,
  );
}

/** 선택지가 2개 이상인 축의 인덱스를 앞에서부터 모은다 */
async function usableAxisIndexes(page, want) {
  const blocks = axisBlocks(page);
  const count = await blocks.count();
  const found = [];
  for (let i = 0; i < count && found.length < want; i += 1) {
    if ((await axisChecks(blocks.nth(i)).count()) >= 2) found.push(i);
  }
  return found;
}

/** 한 축을 「전부 해제 → 첫 선택지만 체크」 상태로 만든다 = 그 축에 조건이 걸린다 */
async function narrowToFirst(page, block) {
  await axisButton(page, block, "全解除");
  return actAndWait(page, () => domClick(axisChecks(block)));
}

/**
 * 진입 후 자료일람 탭으로 맞추고 초기 건수를 돌려준다.
 *
 * 분류축 결합 규칙은 두 탭이 같은 `facetParams` 를 쓰므로 자료일람에서 검증한다
 * (탭 선택 사유는 `harness.mjs` `openDocContents`).
 */
async function enter(page) {
  const total = await openDocContents(page);
  assert(total !== null && total > 0, `초기 건수를 읽지 못했습니다 — ${total}`);
  return total;
}

test("초기 진입은 분류축이 전부 체크로 보이고 건수가 나온다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await enter(page);

    const blocks = axisBlocks(page);
    const axisCount = await blocks.count();
    assert(axisCount > 0, "분류축이 하나도 렌더되지 않았습니다");

    for (let i = 0; i < axisCount; i += 1) {
      const block = blocks.nth(i);
      const total = await axisChecks(block).count();
      if (total === 0) continue; // 선택지 없는 축(`-` 표시)
      const checked = await block.locator('input[type="checkbox"]:checked').count();
      const title = await block.locator("h2").first().innerText();
      assertEqual(checked, total, `축 「${title}」 가 전부 체크가 아닙니다`);
    }
  });
});

test("초기 진입은 분류 조건이 걸리지 않는다 (예외처리 ①)", async () => {
  // 전부 체크를 전체 id 로 펼쳐 보내면 그 축에 분류가 없는 자료가 AND 로 탈락한다 —
  // 초기 화면이 2,461건 중 24건으로 보였던 Redmine #2747 이다.
  // 화면 초기 건수가 **분류 조건을 전혀 안 건 API 건수와 같은지**로 ① 을 고정한다.
  const token = await signToken("super");
  const res = await fetch(`${BASE_URL}/api/contents?page=1&pageSize=1`, {
    headers: { cookie: `qp-auth-token=${token}` },
  });
  assertEqual(res.status, 200, "분류 조건 없는 조회가 실패했습니다");
  const unfiltered = (await res.json()).meta?.total;
  assert(
    typeof unfiltered === "number" && unfiltered > 0,
    `분류 조건 없는 전체 건수를 읽지 못했습니다 — ${unfiltered}`,
  );

  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    assertEqual(
      initial,
      unfiltered,
      "초기 진입에 분류 조건이 걸렸습니다 — facetParams 가 전부 체크를 전체 id 로 펼치고 있습니다",
    );
  });
});

test("축에서 선택지를 줄이면 좁혀지고, 전부 해제하면 다시 넓어진다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await enter(page);

    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");
    const block = axisBlocks(page).nth(axis);

    const narrowed = await narrowToFirst(page, block);
    const released = await axisButton(page, block, "全解除");

    assert(
      released >= narrowed,
      `전부 해제가 선택지 1개보다 좁습니다 — ${narrowed} → ${released}`,
    );
    assert(released > 0, "전부 해제 결과가 0건입니다");
  });
});

test("두 축을 함께 좁히면 AND 로 더 좁혀진다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await enter(page);

    const axes = await usableAxisIndexes(page, 2);
    assert(axes.length === 2, `선택지 2개 이상인 축이 2개 필요합니다 — ${axes.length}개`);

    const afterFirst = await narrowToFirst(page, axisBlocks(page).nth(axes[0]));
    const afterBoth = await narrowToFirst(page, axisBlocks(page).nth(axes[1]));

    assert(
      afterBoth <= afterFirst,
      `축을 더 좁혔는데 늘었습니다 — ${afterFirst} → ${afterBoth}`,
    );
  });
});

test("「すべて解除」 는 조회 없이 0건이다 (예외처리 ②)", async () => {
  // 종전에는 전 축이 조건에서 빠져 **초기보다 넓어졌다.** 11-03 회의에서 0건으로 확정했다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);
    assert(initial > 0, `초기 건수가 0이라 ② 를 판정할 수 없습니다 — ${initial}`);

    // ② 는 조회 자체를 하지 않으므로 API 응답을 기다릴 필요가 없다 — 기본 10초 대기를 줄인다.
    const cleared = await topButton(page, "すべて解除", { responseTimeout: 1_500 });

    assertEqual(
      cleared,
      0,
      "「すべて解除」 가 0건이 아닙니다 — 전 축이 조건에서 빠져 오히려 넓어졌습니다",
    );
  });
});

test("「すべて解除」 → 「すべて選択」 은 초기 건수로 돌아온다", async () => {
  // ② 로 비운 뒤 ① 로 복귀하는 왕복. 어느 쪽이 깨져도 초기 건수와 어긋난다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    await topButton(page, "すべて解除", { responseTimeout: 1_500 });
    const restored = await topButton(page, "すべて選択");

    assertEqual(restored, initial, "전체 해제 후 전체 선택이 초기 건수로 복귀하지 않습니다");
  });
});

test("「すべて選択」 은 미설정(초기)과 같은 조건이다", async () => {
  // `null`(미설정)과 전부 체크는 **서버 조건이 같다** — `commitCategories` 가 전부 체크를
  // `null` 로 정규화하고, ① 에 따라 둘 다 `facetCategoryIds` 를 보내지 않는다. 정규화 가드
  // (`allCategoryIds.length > 0`)가 깨지면 여기서 건수가 튄다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const after = await topButton(page, "すべて選択");

    assertEqual(after, initial, "「すべて選択」 이 미설정과 다른 건수를 냅니다");
  });
});

// 분류 컬럼 정렬은 Prisma 가 아니라 **raw SQL** 로 간다(`sortCategoryCode` 분기). 그래서
// 키워드 조건도 raw SQL 판본이 따로 쓰이는데, 2026-10-29 에 그쪽 `ESCAPE` 절의 템플릿
// 리터럴 이스케이프가 한 단계 모자라 **SQL 파싱 에러(1064) → 500** 이 됐다.
//
// 화면에서는 분류 컬럼 헤더로 정렬을 걸어 둔 상태에서 검색어를 3자 이상 입력하면 바로
// 재현된다(실시간 검색이 정렬을 유지한다). 종전 케이스는 「키워드 없는 정렬」과
// 「정렬 없는 키워드」만 덮어 이 조합을 통과시켰다 — API 레벨로 고정한다.
test("분류 정렬 + 키워드 조합이 500 이 되지 않는다", async () => {
  const token = await signToken("super");
  const cookie = `qp-auth-token=${token}`;

  // 축 코드를 코드에 박지 않는다 — 폐지된 축 상수로 깨진 선례가 있다(파일 상단 주석).
  const treeRes = await fetch(`${BASE_URL}/api/categories?activeOnly=true`, {
    headers: { cookie },
  });
  const axes = ((await treeRes.json()).data ?? []).filter((a) => a.isVisible !== false);
  assert(axes.length > 0, "표시 중인 분류축이 없어 판정할 수 없습니다");
  const axisCode = axes[0].categoryCode;

  // 평범한 검색어 / LIKE 메타문자가 든 검색어 양쪽을 본다. 메타문자 쪽은 이스케이프가
  // 실제로 적용되는 경로라, ESCAPE 절이 깨지면 여기서 먼저 터진다.
  for (const keyword of ["TEST", "100%", "A_1"]) {
    const url =
      `${BASE_URL}/api/contents?page=1&pageSize=5&sortDir=asc` +
      `&sortCategoryCode=${encodeURIComponent(axisCode)}` +
      `&keyword=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, { headers: { cookie } });
    let body = "";
    try {
      body = JSON.stringify(await res.json()).slice(0, 120);
    } catch {
      body = "(본문 없음)";
    }
    assertEqual(
      res.status,
      200,
      `분류 정렬(${axisCode}) + 키워드 "${keyword}" 조회가 실패했습니다 — ${body}`,
    );
  }
});

process.exitCode = (await run("좌측영역 분류축 필터")) > 0 ? 1 : 0;
