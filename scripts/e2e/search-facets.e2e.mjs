// 좌측영역(분류축) 필터 — 2026-11-12 회의 확정 모델.
//
//   - 축마다 2Depth 선택지 + 「その他」(가상 선택지)가 있고, **체크한 축만 조건**이다.
//   - 화면 첫 진입·검색어 3자 미만·검색어 [x] → 좌측 **전체 해제**, 목록은 전체 데이터.
//   - 「すべて解除」 → 조건 없음 = 전체 데이터(초기와 같다). 종전 「조회 없이 0건」(②)은 폐지.
//   - 「すべて選択」(「その他」 포함) → 각 축이 값 있음·없음을 모두 허용 = 전체 데이터.
//   - 공개 자료가 한 건도 연결되지 않은 선택지는 **조건에서 제외**(체크는 화면에 유지, ③,
//     Redmine #2745).
//
// 「その他」는 그 축에 분류가 하나도 없는 자료를 같은 축의 OR 로 더한다. 그래서 한 축에서
// 「2Depth 전부 체크」와 「その他」 건수의 합은 전체 건수와 같아야 한다(분할).
//
// 이 스펙은 **절대 건수를 단언하지 않고 상대 비교만** 한다.
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
 * 좌측 분류축 = 카테고리관리 **사용 여부** Y 인 1Depth (`resolveFilterAxes` 와 같은 기준).
 * `isVisible`(一覧表示)은 목록 컬럼 전용이라 보지 않는다(Redmine #2781). 제품상태 축(`PRDST`)은
 * 형번 속성으로 옮겨져 화면 어디에도 나오지 않는다. 슈퍼관리자 토큰이라 사내전용도 포함된다.
 */
const LEGACY_PRODUCT_STATUS_AXIS_CODE = "PRDST";
function filterAxes(tree) {
  return (tree ?? []).filter((a) => a.categoryCode !== LEGACY_PRODUCT_STATUS_AXIS_CODE);
}

/**
 * 분류축 블록들 — `aside` 직계 `div` 중 `h2`(축 제목)를 가진 것.
 * 형번축·관리자 전용 필터는 `section` 이므로 걸리지 않는다.
 */
function axisBlocks(page) {
  return page.locator("aside > div").filter({ has: page.locator("h2") });
}

/**
 * 축 블록 안의 **2Depth 선택지** 체크박스 — 가상 선택지 「その他」는 뺀다.
 * 실제 2Depth 에도 「その他」가 있어 텍스트로는 못 가른다 — `data-facet-none` 래퍼로 가른다.
 */
function axisChecks(block) {
  return block.locator('div:not([data-facet-none]) > label input[type="checkbox"]');
}

/** 축 블록의 「その他」 체크박스 */
function noneCheck(block) {
  return block.locator('[data-facet-none] input[type="checkbox"]');
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

test("초기 진입은 분류축이 전부 해제로 보이고 건수가 나온다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await enter(page);

    const blocks = axisBlocks(page);
    const axisCount = await blocks.count();
    assert(axisCount > 0, "분류축이 하나도 렌더되지 않았습니다");

    for (let i = 0; i < axisCount; i += 1) {
      const block = blocks.nth(i);
      const checked = await block.locator('input[type="checkbox"]:checked').count();
      const title = await block.locator("h2").first().innerText();
      assertEqual(checked, 0, `축 「${title}」 에 체크가 남아 있습니다 — 초기 상태는 전체 해제입니다`);
    }
  });
});

/** 분류 조건을 전혀 안 건 API 건수 — 전체 해제·전체 선택의 기준값 */
async function unfilteredTotal() {
  const token = await signToken("super");
  const res = await fetch(`${BASE_URL}/api/contents?page=1&pageSize=1`, {
    headers: { cookie: `qp-auth-token=${token}` },
  });
  assertEqual(res.status, 200, "분류 조건 없는 조회가 실패했습니다");
  const total = (await res.json()).meta?.total;
  assert(typeof total === "number" && total > 0, `분류 조건 없는 전체 건수를 읽지 못했습니다 — ${total}`);
  return total;
}

test("초기 진입은 분류 조건이 걸리지 않는다", async () => {
  // 전체 해제는 「체크한 축이 없다」는 뜻이라 조건이 없다. 화면 초기 건수가 분류 조건을
  // 전혀 안 건 API 건수와 같은지로 고정한다.
  const unfiltered = await unfilteredTotal();
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);
    assertEqual(initial, unfiltered, "초기 진입에 분류 조건이 걸렸습니다");
  });
});

test("축에서 선택지를 좁히면 좁혀지고, 그 축을 전부 해제하면 다시 넓어진다", async () => {
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");
    const block = axisBlocks(page).nth(axis);

    const narrowed = await narrowToFirst(page, block);
    const released = await axisButton(page, block, "全解除");

    assert(narrowed <= initial, `선택지 1개로 좁혔는데 늘었습니다 — ${initial} → ${narrowed}`);
    assertEqual(released, initial, "축을 전부 해제했는데 초기(전체) 건수로 돌아오지 않습니다");
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

test("「その他」 를 켜면 그 축이 빈 자료가 OR 로 더해진다 (줄지 않는다)", async () => {
  await withPage({ role: "super" }, async (page) => {
    await enter(page);

    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");
    const block = axisBlocks(page).nth(axis);

    const narrowed = await narrowToFirst(page, block);
    const withNone = await actAndWait(page, () => domClick(noneCheck(block)));

    assert(
      withNone >= narrowed,
      `「その他」를 켰는데 줄었습니다 — ${narrowed} → ${withNone}. OR 가 아니라 조건이 뒤집혔습니다`,
    );
  });
});

test("「すべて解除」 는 조건 없음 = 초기(전체)와 같은 건수다", async () => {
  // 종전 ② 「조회 없이 0건」은 2026-11-12 회의로 폐지됐다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);
    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");
    await narrowToFirst(page, axisBlocks(page).nth(axis));

    const cleared = await topButton(page, "すべて解除");
    assertEqual(cleared, initial, "「すべて解除」 가 전체 건수가 아닙니다");
  });
});

test("「すべて選択」 은 「その他」까지 켜져 초기(전체)와 같은 건수다", async () => {
  // 각 축의 「2Depth 전부 + その他」는 그 축의 모든 상태를 허용하므로 조건이 없다.
  // 「その他」가 같이 켜지지 않으면 분류가 빈 자료가 빠져 초기보다 줄어든다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const selected = await topButton(page, "すべて選択");
    assertEqual(selected, initial, "「すべて選択」 이 전체 건수가 아닙니다 — 「その他」가 함께 켜졌는지 확인");

    const blocks = axisBlocks(page);
    const axisCount = await blocks.count();
    for (let i = 0; i < axisCount; i += 1) {
      const block = blocks.nth(i);
      if ((await noneCheck(block).count()) === 0) continue;
      const title = await block.locator("h2").first().innerText();
      assert(await noneCheck(block).isChecked(), `축 「${title}」 의 「その他」가 켜지지 않았습니다`);
    }
  });
});

test("한 축의 「2Depth 전부」 + 「その他」 건수의 합은 전체와 같다 (API)", async () => {
  // 「その他」 조건(그 축 연결 없음)과 2Depth 전부(그 축 연결 있음)는 자료를 둘로 나눈다.
  // 합이 어긋나면 「その他」 번역(`none: { category: { parentId } }`)이 틀렸다는 신호다.
  const token = await signToken("super");
  const cookie = `qp-auth-token=${token}`;
  const unfiltered = await unfilteredTotal();

  const treeRes = await fetch(`${BASE_URL}/api/categories?activeOnly=true`, { headers: { cookie } });
  const axes = filterAxes((await treeRes.json()).data);
  assert(axes.length > 0, "표시 중인 분류축이 없어 판정할 수 없습니다");

  const count = async (q) => {
    const res = await fetch(`${BASE_URL}/api/contents?page=1&pageSize=1&${q}`, { headers: { cookie } });
    assertEqual(res.status, 200, `조회 실패 — ${q}`);
    return (await res.json()).meta?.total;
  };

  for (const axis of axes) {
    const childIds = (axis.children ?? []).map((c) => c.id);
    if (childIds.length === 0) continue;
    const withValue = await count(`facetCategoryIds=${childIds.join(",")}`);
    const withoutValue = await count(`facetNoneAxisIds=${axis.id}`);
    assertEqual(
      withValue + withoutValue,
      unfiltered,
      `축 「${axis.name}」: 값 있음 ${withValue} + 「その他」 ${withoutValue} ≠ 전체 ${unfiltered}`,
    );
  }
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
  const axes = filterAxes((await treeRes.json()).data);
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

test("단독 선택이 전건을 반환하지 않는다 (예외처리 ③)", async () => {
  // ③ 은 공개 자료가 한 건도 없는 선택지를 조건에서 뺀다. 그 결과 **유효한 체크가 0개**가 되면
  // 서버는 조회하지 않고 0건을 낸다(`unsatisfiable`) — 체크 1개인데 전건이 되면 안 된다.
  //
  // 처음 구현은 전건이었다 — 조건이 전부 걸러지면 `conditions: []` 가 되고 호출부가 그것을
  // 「조건 없음」으로 받아, **체크 1개만 켜진 상태로 published 전건**이 나왔다(2026-11-03 화면
  // 확인에서 드러남). 「파라미터 미전송 = 조건 없음 = 전건」과 구분되어야 한다.
  //
  // 카테고리 명칭을 코드에 박지 않는다. 표시 축의 2Depth 를 **하나씩 단독으로** 걸어 보고,
  // 전체 건수와 **똑같은 결과**를 내는 선택지가 하나라도 있으면 FAIL 이다 — 그게 조건이
  // 통째로 빠졌다는 신호다. 자료 0건 선택지는 0 을, 자료 있는 선택지는 전체보다 작은 수를
  // 돌려줘야 한다.
  //
  // ⚠️ 어떤 분류가 **모든 자료에 붙어 있으면** 단독 선택이 전건과 같아져 오탐이 된다. 개발 DB
  // 최대는 `情報種別` 의 한 선택지로 2,461건 중 2,402건이라 여유가 있다(2026-11-03 실측).
  // 오탐이 나면 그 분류의 커버리지를 먼저 확인할 것.
  const token = await signToken("super");
  const cookie = `qp-auth-token=${token}`;

  const treeRes = await fetch(`${BASE_URL}/api/categories?activeOnly=true`, {
    headers: { cookie },
  });
  assertEqual(treeRes.status, 200, "카테고리 트리 조회가 실패했습니다");
  const axes = filterAxes((await treeRes.json()).data);
  const selectable = axes.flatMap((a) => (a.children ?? []).map((c) => c.id));
  assert(selectable.length > 0, "표시 축에 선택지가 없어 판정할 수 없습니다");

  const baseRes = await fetch(`${BASE_URL}/api/contents?page=1&pageSize=1`, {
    headers: { cookie },
  });
  assertEqual(baseRes.status, 200, "분류 조건 없는 조회가 실패했습니다");
  const unfiltered = (await baseRes.json()).meta?.total;
  assert(
    typeof unfiltered === "number" && unfiltered > 0,
    `분류 조건 없는 전체 건수를 읽지 못했습니다 — ${unfiltered}`,
  );

  const totals = [];
  for (const id of selectable) {
    const res = await fetch(
      `${BASE_URL}/api/contents?page=1&pageSize=1&facetCategoryIds=${id}`,
      { headers: { cookie } },
    );
    assertEqual(res.status, 200, `facetCategoryIds=${id} 조회가 실패했습니다`);
    totals.push({ id, total: (await res.json()).meta?.total });
  }

  const leaked = totals.filter((t) => t.total === unfiltered);
  assert(
    leaked.length === 0,
    `단독 선택인데 전건(${unfiltered}건)이 나온 선택지가 있습니다 — ` +
      `id=${leaked.map((t) => t.id).join(",")}. ③ 이 조건을 비워 「조건 없음」으로 흘렀습니다`,
  );

  // 과도하게 지우지 않는지 — 자료가 있는 선택지는 0 이 아니어야 한다.
  assert(
    totals.some((t) => t.total > 0),
    "모든 선택지가 0건입니다 — ③ 이 과도하게 걸러내고 있습니다",
  );
});

process.exitCode = (await run("좌측영역 분류축 필터")) > 0 ? 1 : 0;
