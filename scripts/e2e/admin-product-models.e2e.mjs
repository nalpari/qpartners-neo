// 형번관리(`/admin/product-models`) 등록·수정·삭제 — REQ-007.
//
// 좌=목록 / 우=상세 2단 배치(2026-10-13). 행을 누르면 우측 폼이 편집 모드로 바뀌고,
// `新規`·`初期化`·`保存`·`削除` 로 조작한다.
//
// ⚠️ 개발 DB 에 **실제로 형번을 만들고 지운다.** 식별용으로 `E2E-TMP-` 접두사를 쓰고
// 각 테스트가 끝날 때 되돌린다. 중간에 실패해 잔재가 남으면 형번관리 화면에서 지우면 된다.
//
// 대기 원칙 (2026-10-27):
//   - 진입·새로고침은 `domcontentloaded` + 그리드 행 대기. `networkidle` 은 dev(Turbopack)에서
//     30초 넘게 걸린다(실측 32~34초 대 5.4초).
//   - 저장·삭제 뒤에는 **목록 재조회 응답**을 기다린다. 고정 대기로는 재조회 전 그리드를 읽어
//     Total 비교가 실행마다 달라진다.
//   - Total 비교는 **절대 건수가 아니라 before 기준 상대 비교**다. 개발 DB 의 형번 건수가
//     변해도(다른 테스트의 잔재 등) 영향받지 않는다.

import {
  actAndSettle,
  assert,
  assertEqual,
  BASE_URL,
  run,
  test,
  waitForStableNumber,
  withPage,
} from "./harness.mjs";

const PAGE = `${BASE_URL}/admin/product-models`;
const API = /\/api\/product-models/;
/** UI 전환(드롭다운 펼침, 폼 리셋)용 짧은 대기 — 서버 왕복이 없는 구간에만 쓴다. */
const UI_TICK = 400;

const MODEL_INPUT = 'input[placeholder="例）HQJP-A44-1"]';
const SORT_INPUT = 'input[inputmode="numeric"], input[type="number"]';
const TOTAL = '[data-testid="product-models-total"]';

async function open(page) {
  const loaded = actAndSettle(page, async () => {
    await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90_000 });
  }, { apiPattern: API, responseTimeout: 60_000 });
  await loaded;
  await page.waitForSelector(".ag-row", { timeout: 40_000 });
}

async function reload(page) {
  const loaded = actAndSettle(page, async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
  }, { apiPattern: API, responseTimeout: 60_000 });
  await loaded;
  await page.waitForSelector(".ag-row", { timeout: 40_000 });
}

/**
 * 형번관리 화면의 `Total N` 의 N — 값이 안정될 때까지 기다린다.
 *
 * harness 의 `readTotal` 과 이름을 달리한다 — 그쪽은 콘텐츠 목록의 `result-total` 전용이고,
 * 이 화면은 `product-models-total` 이라 셀렉터가 다르다.
 */
function readModelTotal(page) {
  return waitForStableNumber(page, TOTAL, { timeout: 30_000 });
}

/** 우측 폼(`型番情報`) 영역 — 목록과 문구가 겹치는 요소를 고를 때 반드시 이 안에서 찾는다. */
function formSection(page) {
  return page.locator("section").filter({ hasText: "型番情報" });
}

/** 카테고리 SelectBox 에서 라벨로 고른다 (폼의 2번째 select 가 아니라 라벨 기준으로 찾는다). */
async function pickCategory(page, labelPart) {
  const row = formSection(page);
  await row.locator("button").filter({ hasText: /選択してください|製品分類/ }).first().click();
  const option = page.getByRole("button", { name: new RegExp(labelPart) }).first();
  await option.waitFor({ timeout: 10_000 });
  await option.click();
  await page.waitForTimeout(UI_TICK);
}

/**
 * 폼 채우기.
 *
 * `status`(製品ステータス) 는 2026-10-28 추가된 **필수 입력**이다(REQ-007). 폼이 라디오를
 * 미선택으로 시작하므로, 등록 케이스에서 빠뜨리면 「製品ステータスを選択してください。」
 * 로 저장이 막힌다.
 */
async function fillForm(page, { modelCode, category, status, sortOrder, visible }) {
  if (modelCode !== undefined) await page.locator(MODEL_INPUT).fill(modelCode);
  if (category !== undefined) await pickCategory(page, category);
  if (status !== undefined) {
    // ⚠️ **폼 영역으로 한정**해야 한다. 목록의 제품상태 배지가 같은 문구(`現行品` /
    // `販売終了品`)를 쓰므로, 페이지 전체에서 찾으면 목록 셀을 먼저 집는다. 그러면 그 행이
    // 편집 모드로 열려 「신규 등록」이 조용히 「기존 형번 수정」으로 바뀐다
    // (2026-10-28 실패: Total 이 안 늘고, 중복 저장이 성공으로 보였다).
    await formSection(page)
      .getByText(status === "eol" ? "販売終了品" : "現行品", { exact: true })
      .first()
      .click();
  }
  if (sortOrder !== undefined) {
    const sort = page.locator(SORT_INPUT).first();
    if (await sort.count()) await sort.fill(String(sortOrder));
  }
  if (visible !== undefined) {
    await page.getByText(visible ? "Y" : "N", { exact: true }).first().click();
  }
}

/** 열려 있는 공용 알림(`alert-dialog`)을 닫는다. 떠 있는 동안은 다른 클릭이 전부 막힌다. */
async function dismissAlert(page) {
  const dialog = page.locator('[role="alertdialog"]');
  if (!(await dialog.isVisible().catch(() => false))) return null;
  const message = await dialog.innerText();
  await dialog.getByRole("button", { name: "確認", exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: 20_000 });
  return message;
}

/**
 * 저장 → 결과 알림까지 닫고 그 문구를 돌려준다.
 *
 * 저장이 성공하면 목록이 재조회되므로 그 응답을 기다린다. 실패(중복 등)하면 재조회가 없으니
 * `actAndSettle` 의 대기자는 타임아웃을 삼키고 넘어간다 — 알림 문구로 판정한다.
 */
async function save(page) {
  await actAndSettle(page, async () => {
    await page.getByRole("button", { name: "保存", exact: true }).click();
    // 알림이 뜰 때까지는 기다려야 한다 — 뜨기 전에 닫으려 하면 아무 일도 일어나지 않는다.
    await page
      .locator('[role="alertdialog"]')
      .waitFor({ timeout: 20_000 })
      .catch(() => null);
  }, { apiPattern: API });
  return dismissAlert(page);
}

/** 목록에서 그 형번의 행을 연다. 없으면 false. */
async function openRow(page, modelCode) {
  const cell = page.getByText(modelCode, { exact: true }).first();
  if ((await cell.count()) === 0) return false;
  await cell.click();
  // 폼이 그 형번으로 채워질 때까지 기다린다 — 고정 대기로는 이전 값을 읽는다.
  await page
    .locator(MODEL_INPUT)
    .filter({ hasNot: page.locator("[disabled]") })
    .first()
    .waitFor({ timeout: 10_000 });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await page.locator(MODEL_INPUT).inputValue()) === modelCode) return true;
    await page.waitForTimeout(150);
  }
  return true; // 값이 안 맞으면 호출자의 단언이 잡는다
}

/**
 * 삭제 — `削除` 는 네이티브 confirm 이 아니라 공용 `alert-dialog`(role=alertdialog)를 띄운다.
 * 확인 버튼 기본 문구는 `確認`, 취소는 `キャンセル` (`components/common/alert-dialog.tsx`).
 */
async function deleteSelected(page) {
  await actAndSettle(page, async () => {
    await page.getByRole("button", { name: "削除", exact: true }).click();
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "確認", exact: true }).click();
    await dialog.waitFor({ state: "detached", timeout: 20_000 });
    // 삭제 완료 알림이 또 뜬다
    await page
      .locator('[role="alertdialog"]')
      .waitFor({ timeout: 20_000 })
      .catch(() => null);
  }, { apiPattern: API });
  await dismissAlert(page);
}

/** 남아 있으면 지운다 — 테스트 잔재 정리용. */
async function removeIfExists(page, modelCode) {
  await reload(page);
  if (!(await openRow(page, modelCode))) return;
  await deleteSelected(page);
}

test("행을 누르면 우측 폼이 그 형번의 편집 모드가 된다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await open(page);
    assert(await openRow(page, "HQJP-A44-1"), "대상 형번이 목록에 없습니다");
    assertEqual(
      await page.locator(MODEL_INPUT).inputValue(),
      "HQJP-A44-1",
      "폼에 형번이 채워지지 않았습니다",
    );
  });
});

test("新規 를 누르면 폼이 비워진다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await open(page);
    await openRow(page, "HQJP-A44-1");
    await page.getByRole("button", { name: "新規", exact: true }).click();
    // 비워질 때까지 기다린다
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if ((await page.locator(MODEL_INPUT).inputValue()) === "") break;
      await page.waitForTimeout(150);
    }
    assertEqual(await page.locator(MODEL_INPUT).inputValue(), "", "폼이 비워지지 않았습니다");
  });
});

test("등록 → 수정 → 삭제가 목록에 반영된다", async () => {
  const CODE = `E2E-TMP-${Date.now().toString().slice(-6)}`;
  await withPage({ role: "super" }, async (page) => {
    await open(page);
    const before = await readModelTotal(page);
    assert(before !== null && before > 0, `초기 Total 을 읽지 못했습니다 — ${before}`);

    // 등록
    await page.getByRole("button", { name: "新規", exact: true }).click();
    await page.waitForTimeout(UI_TICK);
    await fillForm(page, {
      modelCode: CODE,
      category: "蓄電システム",
      status: "current",
      sortOrder: 99,
      visible: true,
    });
    await save(page);
    assertEqual(await readModelTotal(page), before + 1, "등록 후 Total 이 늘지 않았습니다");
    assert(await openRow(page, CODE), "등록한 형번이 목록에 없습니다");

    // 수정 — 표시순서 변경.
    // 저장 성공 알림까지 확인한다. 실패해도 폼만 남아 조용히 넘어가기 쉽다.
    await fillForm(page, { sortOrder: 98 });
    const saved = await save(page);
    assert(
      saved === null || saved.includes("保存"),
      `수정 저장이 실패했습니다 — "${String(saved).replace(/\s+/g, " ").slice(0, 120)}"`,
    );
    // 저장 직후의 그리드는 재조회가 끝나기 전일 수 있다 — 새로고침해 서버 값으로 확인한다.
    await reload(page);
    assert(await openRow(page, CODE), "수정 후 형번이 사라졌습니다");
    const sort = page.locator(SORT_INPUT).first();
    if (await sort.count()) {
      assertEqual(await sort.inputValue(), "98", "표시순서 수정이 반영되지 않았습니다");
    }

    // 삭제
    await deleteSelected(page);
    assertEqual(await readModelTotal(page), before, "삭제 후 Total 이 돌아오지 않았습니다");
  });
});

test("같은 카테고리에 같은 형번을 저장하면 거부된다", async () => {
  await withPage({ role: "super" }, async (page) => {
    await open(page);
    await page.getByRole("button", { name: "新規", exact: true }).click();
    await page.waitForTimeout(UI_TICK);
    // 대소문자만 다른 기존 형번 — 콜레이션상 중복이다
    await fillForm(page, {
      modelCode: "hqjp-a44-1",
      category: "パワーコンディショナ",
      status: "current",
      sortOrder: 1,
      visible: true,
    });
    const message = (await save(page)) ?? (await page.locator("body").innerText());
    assert(
      message.includes("同じカテゴリ内に同じ型番"),
      `중복 저장이 거부되지 않았거나 안내 문구가 다릅니다 — "${message.replace(/\s+/g, " ").slice(0, 120)}"`,
    );
    await removeIfExists(page, "hqjp-a44-1");
  });
});

test("비관리자는 형번관리 화면에 들어갈 수 없다", async () => {
  await withPage({ role: "store1" }, async (page) => {
    await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // 차단은 리다이렉트로 일어난다 — URL 이 바뀔 때까지 기다린다.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (!page.url().replace(BASE_URL, "").startsWith("/admin/product-models")) break;
      await page.waitForTimeout(250);
    }
    const url = page.url().replace(BASE_URL, "");
    assert(!url.startsWith("/admin/product-models"), `차단되지 않았습니다 — ${url}`);
  });
});

process.exitCode = (await run("형번관리 CRUD")) > 0 ? 1 : 0;
