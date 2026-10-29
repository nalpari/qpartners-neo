// 좌측영역(분류축) 필터 — 「전부 해제한 축만 조건에서 빠진다」 모델.
//
// 2026-10-23 사용자 확정 규칙 (계획서 §27.3):
//   - 축 안은 OR, 축 사이는 AND
//   - **전부 체크·일부 체크 → AND 조건 대상**
//   - **전부 해제 → 그 축만 AND 조건에서 제외** (조회 자체에서 빠지는 게 아니다)
//   - 초기 상태 `facetCategoryIds: null`(미설정)은 화면상 전부 체크이고, 서버에도
//     **전부 체크와 같은 조건**이 나간다 (`contents-contents.tsx` `facetParams` 가 펼친다).
//     `[]`(전부 해제)만 그 축을 조건에서 뺀다.
//
// 조건이 걸린 축은 **그 축에 분류가 하나도 없는 자료를 탈락시킨다.** 개발 DB 는 축이 5개이고
// 전 축에 분류를 가진 published 자료가 2,459건 중 21건뿐이라 초기 화면이 21건으로 보인다
// (2026-10-26 실측). 그래서 이 스펙은 **절대 건수를 단언하지 않고 상대 비교만** 한다.
//
// 2026-10-13 의 옛 모델(초기 전부 해제 / 체크한 축만 조건)을 전제한 케이스를 교체했다.
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
  domClick,
  openDocContents,
  run,
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

function topButton(page, name) {
  return actAndWait(page, () => domClick(page.getByRole("button", { name, exact: true })));
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

test("한 축을 전부 해제해도 0건이 되지 않는다", async () => {
  // 회귀 방어 — 2026-10-23 에 「제품분류 3개 해제하니 9건이 0건」 으로 보고된 버그.
  // 전부 해제는 그 축을 **조건에서 빼는** 것이므로 건수가 줄어들 수 없다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");

    const after = await axisButton(page, axisBlocks(page).nth(axis), "全解除");

    assert(after > 0, "축을 전부 해제했더니 0건이 됐습니다 — 축이 조건에서 빠지지 않았습니다");
    assert(after >= initial, `축을 조건에서 뺐는데 줄었습니다 — ${initial} → ${after}`);
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

test("「すべて解除」 는 전 축을 조건에서 뺀다", async () => {
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const [axis] = await usableAxisIndexes(page, 1);
    assert(axis !== undefined, "선택지 2개 이상인 축이 없습니다");
    const narrowed = await narrowToFirst(page, axisBlocks(page).nth(axis));

    const cleared = await topButton(page, "すべて解除");

    // 전 축이 조건에서 빠지므로 분류가 없는 자료까지 포함된다 — 초기보다 많거나 같다.
    assert(cleared >= initial, `「すべて解除」 가 초기보다 좁습니다 — ${initial} → ${cleared}`);
    assert(cleared >= narrowed, "「すべて解除」 가 좁힌 상태를 풀지 않았습니다");
  });
});

test("「すべて選択」 은 미설정(초기)과 같은 조건이다", async () => {
  // `null`(미설정)과 전부 체크는 **서버 조건이 같다** — `facetParams` 가 `null` 을 축 전체로
  // 펼친다. 이 동등성이 깨지면(예: `null` 을 조건 없음으로 되돌리면) 초기 건수가 튄다.
  await withPage({ role: "super" }, async (page) => {
    const initial = await enter(page);

    const after = await topButton(page, "すべて選択");

    assertEqual(after, initial, "「すべて選択」 이 미설정과 다른 건수를 냅니다");
  });
});

process.exitCode = (await run("좌측영역 분류축 필터")) > 0 ? 1 : 0;
