// 최소 E2E 하네스 — 프레임워크 없이 `node` 로 돌린다.
//
// 이 레포에는 테스트 프레임워크가 없다(`package.json` scripts 에 test 없음, jest/vitest 의존성 0).
// `package.json` 수정은 별도 담당자 영역이라, 의존성을 늘리지 않고 돌아가는 형태로 둔다:
//   - 런타임은 node 표준 + 이미 들어 있는 `jose`(JWT 발급)
//   - 브라우저 구동만 Playwright 가 필요하며, 레포에 설치하지 않고 **외부 설치본을 가리킨다**
//     (`PLAYWRIGHT_PATH` 환경변수 — README 참조)
//
// 로그인은 QSP 를 거치지 않는다. `JWT_SECRET` 으로 역할별 토큰을 직접 발급해 쿠키에 넣는다.
// 검색 계통 화면·API 는 QSP 를 타지 않으므로 VPN·2FA 없이 전구간을 돌릴 수 있다.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** `.env.development` 로더 — 값의 역슬래시는 제거한다(DB_PASSWORD 이스케이프 관례). */
export function loadEnv(file = ".env.development") {
  const backslash = String.fromCharCode(92);
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const i = line.indexOf("=");
        let value = line.slice(i + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, i), value.split(backslash).join("")];
      }),
  );
}

/** 테스트용 역할 프로필 — 실제 계정이 아니라 JWT 페이로드만 만든다. */
const ROLE_PROFILES = {
  super: { userId: "e2e-super", userNm: "E2E Super", userTp: "ADMIN", authRole: "SUPER_ADMIN" },
  admin: { userId: "e2e-admin", userNm: "E2E Admin", userTp: "ADMIN", authRole: "ADMIN" },
  store1: { userId: "e2e-store1", userNm: "E2E 1st", userTp: "STORE", authRole: "1ST_STORE" },
  general: { userId: "e2e-general", userNm: "E2E Gen", userTp: "GENERAL", authRole: "GENERAL" },
};

export async function signToken(role) {
  const profile = ROLE_PROFILES[role];
  if (!profile) throw new Error(`알 수 없는 역할: ${role}`);
  const env = loadEnv();
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET 이 .env.development 에 없습니다");
  const { SignJWT } = require_("jose");
  return new SignJWT({
    userId: profile.userId,
    userNm: profile.userNm,
    userTp: profile.userTp,
    compCd: "E2E",
    compNm: "E2E Co",
    email: "e2e@example.com",
    deptNm: "QA",
    authCd: profile.authRole,
    storeLvl: null,
    statCd: "1",
    authRole: profile.authRole,
    twoFactorVerified: true,
    telNo: null,
    pwdInitYn: "Y",
    loginNotiYn: "N",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}

/**
 * Playwright 해석 — 레포에 의존성을 넣지 않으므로 외부 설치본을 찾는다.
 * 경로를 코드에 박지 않는다(머신마다 다르다). `PLAYWRIGHT_PATH` 로 지정한다.
 */
function resolvePlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, "playwright", "playwright-core"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require_(candidate);
    } catch {
      // 다음 후보로
    }
  }
  throw new Error(
    "Playwright 를 찾지 못했습니다. `PLAYWRIGHT_PATH=<playwright 설치 경로>` 를 지정하세요 (scripts/e2e/README.md).",
  );
}

/**
 * 브라우저는 스펙 파일 안에서 **한 번만 띄워 재사용한다.**
 *
 * 케이스마다 `chromium.launch()` 를 하면 기동 비용이 케이스당 40초 가까이 붙고(조회 자체는 2.9초)
 * Chromium 프로세스가 순차로 쌓여 **시스템 메모리 부족으로 실행이 중단됐다**(2026-10-26).
 *
 * 격리는 브라우저가 아니라 **context 단위**로 유지한다 — 쿠키·localStorage·sessionStorage·캐시가
 * 모두 context 소유라, context 를 케이스마다 새로 만들면 케이스 간에 상태가 넘어가지 않는다.
 * 닫는 것은 `run()` 이 전부 끝난 뒤 `closeBrowser()` 가 한다.
 */
let sharedBrowser = null;

async function getBrowser() {
  if (!sharedBrowser) {
    const { chromium } = resolvePlaywright();
    sharedBrowser = await chromium.launch();
  }
  return sharedBrowser;
}

export async function closeBrowser() {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export async function withPage(options, body) {
  const { role = null, viewport = { width: 1600, height: 1000 }, mobile = false } = options ?? {};
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport,
    locale: "ja-JP",
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  if (role) {
    const token = await signToken(role);
    await context.addCookies([
      { name: "qp-auth-token", value: token, domain: "localhost", path: "/" },
    ]);
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  try {
    return await body(page, { pageErrors });
  } finally {
    await context.close();
  }
}

// ── 초미니 러너 ────────────────────────────────────────────────────────────
const cases = [];
export function test(name, fn) {
  cases.push({ name, fn });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * 검증 **전제가 성립하지 않아** 판정할 수 없는 케이스를 「건너뜀」으로 보고한다.
 *
 * 실패와 구분하는 이유: 전제 불성립을 FAIL 로 내면 「구현이 깨졌다」로 읽혀, 정작 봐야 할
 * 실패에 섞인다. 반대로 조용히 PASS 시키면 **검증하지 않은 것을 검증했다고 보고**하는 셈이다.
 * 어느 쪽도 안 되므로 제3의 결과로 남기고, 전제가 갖춰지면 자동으로 다시 검증된다.
 */
class SkipSignal extends Error {}

export function skip(reason) {
  throw new SkipSignal(reason);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
  }
}

export async function run(suiteName) {
  console.log(`\n=== ${suiteName} ===`);
  let failed = 0;
  let skipped = 0;
  try {
    for (const c of cases) {
      const started = Date.now();
      try {
        await c.fn();
        console.log(`  PASS  ${c.name}  (${Date.now() - started}ms)`);
      } catch (error) {
        if (error instanceof SkipSignal) {
          skipped += 1;
          console.log(`  SKIP  ${c.name}  — ${error.message}`);
          continue;
        }
        failed += 1;
        console.log(`  FAIL  ${c.name}  (${Date.now() - started}ms)`);
        console.log(`        ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    // 공용 브라우저를 여기서 닫는다 — 닫지 않으면 Chromium 이 남아 프로세스가 끝나지 않는다.
    await closeBrowser();
  }
  const passed = cases.length - failed - skipped;
  console.log(
    `--- ${passed}/${cases.length} PASS${skipped > 0 ? ` (건너뜀 ${skipped})` : ""}`,
  );
  return failed;
}

// ── 화면 공용 selector / 조작 ──────────────────────────────────────────────
export const SEARCH_INPUT = 'input[placeholder="キーワードを入力してEnterで検索"]';
export const RESULT_TOTAL = '[data-testid="result-total"]';
export const SUGGEST_BOX = '[role="listbox"][aria-label="検索候補"]';

/**
 * ⚠️ `waitUntil` 은 `domcontentloaded` 다 — `networkidle` 을 쓰면 안 된다.
 *
 * 실측(2026-10-27): 같은 화면 진입이 `networkidle` 32~34초 / `domcontentloaded` 5.4~6.1초로
 * **6배** 차이났다. dev(Turbopack)는 HMR 소켓과 청크가 계속 흐르기 때문이다. 이 30초가 케이스마다
 * 붙어 전체 실행이 메모리 압박까지 받았다.
 *
 * 데이터가 아직 안 왔을 수 있지만, 뒤따르는 `waitForSelector(RESULT_TOTAL)` 와
 * `waitForTotal`(값 안정 판정)이 그것을 받는다.
 */
export async function openContents(page, query = "") {
  await page.goto(`${BASE_URL}/contents${query}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
}

/**
 * 좌표 클릭 대신 DOM `click()` 을 쓴다.
 *
 * 체크박스가 `sr-only`(1px clip, `components/common/checkbox.tsx`)이고 헤더가
 * `fixed … z-9999` 라, 좌표 클릭이 헤더·svg 에 가로채여 재시도 끝에 실패한다.
 * DOM `click()` 은 좌표를 타지 않고 React 의 onChange/onClick 을 정상 발생시킨다.
 */
export async function domClick(locator) {
  await locator.first().evaluate((el) => el.click());
}

/**
 * 목록 조회가 끝나고 건수 표시가 그 결과로 바뀔 때까지 기다린 뒤, 그 값을 돌려준다.
 *
 * ⚠️ 고정 대기(`waitForTimeout`)를 쓰면 안 된다. 응답이 그보다 늦으면 **직전 값**을 읽어,
 * 같은 테스트가 단독 실행에서는 통과하고 전체 실행에서는 실패한다(2026-10-26 실측 —
 * 탭을 바꿨는데도 이전 탭의 건수가 그대로 읽혔다).
 *
 * 먼저 네트워크 유휴로 조회 왕복이 끝났음을 보장하고, 그 다음 건수가 연속 `settleReads` 회
 * 같을 때까지 폴링한다. 유휴가 오지 않는 환경(폴링·소켓)에서도 멈추지 않도록 유휴 대기는
 * 실패를 삼킨다.
 */
export async function waitForTotal(page, options = {}) {
  return waitForStableNumber(page, RESULT_TOTAL, options);
}

/**
 * 어떤 요소의 숫자 표시가 **연속 `settleReads` 회 같아질 때까지** 기다린 뒤 그 값을 돌려준다.
 *
 * 숫자가 아직 없거나 `-`(조회 실패·로딩)면 `null` 이고, 그 동안은 안정으로 보지 않고 계속
 * 기다린다. 기한을 넘기면 마지막으로 본 값을 그대로 돌려준다 — 호출자가 단언으로 판정한다.
 *
 * 개발 환경 실측(2026-10-26): `/api/contents` 2.4~2.9초, DB 쿼리 60ms.
 */
export async function waitForStableNumber(page, selector, options = {}) {
  const { timeout = 40_000, settleReads = 3, interval = 250, idleTimeout = 8_000 } = options;
  try {
    await page.waitForLoadState("networkidle", { timeout: idleTimeout });
  } catch {
    // 유휴가 오지 않아도 아래 안정 판정으로 진행한다
  }
  const deadline = Date.now() + timeout;
  let lastSeen = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const value = await readNumber(page, selector);
    if (value !== null && value === lastSeen) {
      stable += 1;
      if (stable >= settleReads) return value;
    } else {
      stable = 0;
      lastSeen = value;
    }
    await page.waitForTimeout(interval);
  }
  return lastSeen;
}

/** 조작을 실행하고 그 조작이 유발하는 GET 조회가 끝날 때까지 기다린다 (건수 판정 없음). */
export async function actAndSettle(page, action, options = {}) {
  const { apiPattern, responseTimeout = 20_000 } = options;
  const waiter = page
    .waitForResponse((r) => apiPattern.test(r.url()) && r.request().method() === "GET", {
      timeout: responseTimeout,
    })
    .catch(() => null);
  await action();
  return waiter;
}

/**
 * 조작을 실행하고 목록 조회·리렌더가 끝날 때까지 기다린 뒤 건수를 돌려준다.
 *
 * ⚠️ 대기자를 **조작 전에** 걸어야 한다. 조작 뒤에 `networkidle` 부터 기다리면 "요청이 아직
 * 시작되지 않은 상태"를 유휴로 오판해, 조회 전 값(탭 전환 직후의 `0`)을 확정해 버린다
 * (2026-10-26 실측 — 자료일람 전환 직후 `合計 0件の資料` 를 그대로 읽었다).
 *
 * 캐시 적중으로 요청이 없을 수도 있으므로 대기자의 타임아웃은 짧게 두고 실패를 삼킨다 —
 * 그 경우는 뒤따르는 `waitForTotal` 의 값 안정 판정이 받는다.
 */
export async function actAndWait(page, action, options = {}) {
  const { apiPattern = /\/api\/(contents|products)\?/, responseTimeout = 10_000 } = options;
  const waiter = page
    .waitForResponse((r) => apiPattern.test(r.url()), { timeout: responseTimeout })
    .catch(() => null);
  await action();
  await waiter;
  return waitForTotal(page, options);
}

/**
 * 진입 후 **자료일람 탭**(`資料から探す`)으로 맞추고, 그 탭의 건수를 돌려준다.
 *
 * 기본 탭은 `製品から探す`(제품일람)인데, 개발 DB 는 형번 연결 자료가 7건(축 커버리지 최대
 * 3개)뿐이라 전 축 조건이면 **0건**이 된다 — 건수 비교가 성립하지 않는다(2026-10-26 실측).
 * 자료일람은 전 축에 분류를 가진 자료가 21건 있어 비교가 가능하다.
 *
 * ⚠️ **하이드레이션을 기다린 뒤에 클릭해야 한다.** `goto` 가 `domcontentloaded` 로 끝나므로
 * 그 직후에는 React 가 아직 붙지 않아 `el.click()` 이 **아무 일도 하지 않는다**. 그러면 탭이
 * 제품일람에 머물고, 제품일람은 실제로 0건이라 `waitForTotal` 이 그 0 을 **안정값으로 확정**해
 * 전 케이스가 「초기 건수 0」으로 깨진다(2026-10-27 실측 — 1/8 PASS).
 *
 * 그래서 첫 조회 응답을 하이드레이션 신호로 쓰고, 클릭 뒤에는 `aria-selected` 로 **탭이 실제로
 * 바뀌었는지 확인**한다. 0 을 조용히 받아들이지 않기 위한 장치다.
 */
export async function openDocContents(page, query = "") {
  // 대기자를 goto 전에 걸어야 한다 — 로드 중에 오는 첫 응답을 놓치지 않기 위함.
  const hydrated = page
    .waitForResponse((r) => /\/api\/(contents|products)\?/.test(r.url()), { timeout: 60_000 })
    .catch(() => null);
  await openContents(page, query);
  await page.waitForSelector(RESULT_TOTAL, { timeout: 40_000 });
  await hydrated;

  const docTab = page.getByRole("tab", { name: "資料から探す", exact: true });
  const total = await actAndWait(page, () => domClick(docTab));
  const selected = await docTab.getAttribute("aria-selected");
  if (selected !== "true") {
    throw new Error(`자료일람 탭으로 바뀌지 않았습니다 (aria-selected=${selected})`);
  }
  return total;
}

/** 화면에 표시된 `合計 N 件` 의 N. 아직 안 그려졌으면 null. */
export async function readTotal(page) {
  return readNumber(page, RESULT_TOTAL);
}

/** 어떤 요소의 텍스트에서 숫자만 뽑는다. 요소가 없거나 숫자가 없으면(`-` 등) null. */
export async function readNumber(page, selector) {
  const el = page.locator(selector);
  if ((await el.count()) === 0) return null;
  const text = (await el.first().innerText()).replace(/[^0-9]/g, "");
  return text === "" ? null : Number(text);
}
