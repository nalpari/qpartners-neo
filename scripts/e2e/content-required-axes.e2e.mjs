// 콘텐츠 등록·수정 — **축별 필수 분류** 검증 (2026-10-14 사용자 결정).
//
// 종전 검증은 「전체에서 1개 이상」(`カテゴリを1つ以上選択してください。`)이라
// `製品分類` 만 고르고 저장하면 `情報種別` 가 빈 채로 등록됐다.
// 그래서 분류 누락이 쌓였고, 좌측영역에서 그 축을 쓰는 순간 자료가 사라졌다.
//
// 규칙: `情報種別` · `製品分類` 는 **각각 1개 이상** 필수.
// 단 **현재 표시 중인 축에만** 적용한다 — 축이 폐지되면 조용히 어긋나지 않고 자동으로 빠진다.
//
// ⚠️ 2026-10-28: `製品ステータス`(PRDST) 가 필수 축에서 **빠졌다.** 제품상태가 형번의
// 속성이 되면서(REQ-007) 자료가 직접 갖는 분류가 아니게 됐고, 자료일람 표시는 연결된
// 형번에서 파생한다(REQ-005). 화면에서도 레거시 축으로 제외된다
// (`LEGACY_PRODUCT_STATUS_AXIS_CODE`).

import { assert, assertEqual, BASE_URL, run, signToken, skip, test } from "./harness.mjs";

/** 필수 축 — `src/lib/schemas/common.ts#REQUIRED_AXIS_CODES` 와 **같아야 한다**. */
const REQUIRED_AXES = ["INFO", "PROD"];

/** 화면·필수축 양쪽에서 제외된 레거시 축 — 제품상태(형번 속성으로 이전). */
const LEGACY_AXIS = "PRDST";

/** 축 코드 → 그 축의 2Depth id 목록, 그리고 전체·표시 중 축 코드 */
async function axisChildren(token) {
  const res = await fetch(`${BASE_URL}/api/categories?activeOnly=true`, {
    headers: { cookie: `qp-auth-token=${token}` },
  });
  const tree = (await res.json()).data ?? [];
  const map = {};
  for (const axis of tree) map[axis.categoryCode] = (axis.children ?? []).map((c) => c.id);
  return {
    map,
    all: tree.map((a) => a.categoryCode),
    visible: tree.filter((a) => a.isVisible !== false).map((a) => a.categoryCode),
  };
}

async function post(token, categoryIds) {
  const res = await fetch(`${BASE_URL}/api/contents`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `qp-auth-token=${token}` },
    body: JSON.stringify({
      title: `[E2E-REQ] ${Date.now()}`,
      status: "draft",
      categoryIds,
      targets: [{ roleCode: "GENERAL", startAt: "2026-10-01T00:00:00+09:00" }],
    }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: res.status, body };
}

async function remove(token, id) {
  if (!id) return;
  await fetch(`${BASE_URL}/api/contents/${id}`, {
    method: "DELETE",
    headers: { cookie: `qp-auth-token=${token}` },
  });
}

test("필수 축 하나라도 비면 서버가 거부한다", async () => {
  const token = await signToken("super");
  const { map, visible } = await axisChildren(token);
  const required = REQUIRED_AXES.filter((c) => visible.includes(c));
  assert(required.length > 0, "필수 축이 화면에 하나도 없습니다 — 전제 불성립");

  for (const omit of required) {
    const ids = required.filter((c) => c !== omit).map((c) => map[c][0]);
    const { status, body } = await post(token, ids);
    assert(
      status === 400,
      `${omit} 을 빼고 저장했는데 HTTP ${status} 로 통과했습니다 — ${JSON.stringify(body).slice(0, 160)}`,
    );
  }
});

test("필수 축을 모두 채우면 저장된다", async () => {
  const token = await signToken("super");
  const { map, visible } = await axisChildren(token);
  const required = REQUIRED_AXES.filter((c) => visible.includes(c));
  const ids = required.map((c) => map[c][0]);

  const { status, body } = await post(token, ids);
  assert(status === 201, `필수를 다 채웠는데 거부됐습니다 — HTTP ${status} ${JSON.stringify(body).slice(0, 160)}`);
  await remove(token, body?.data?.id);
});

test("카테고리를 아예 안 고르면 거부한다", async () => {
  const token = await signToken("super");
  const { status } = await post(token, []);
  assert(status === 400, `빈 카테고리가 HTTP ${status} 로 통과했습니다`);
});

test("표시되지 않는 축은 필수로 보지 않는다", async () => {
  const token = await signToken("super");
  const { map, all, visible } = await axisChildren(token);

  // 축 **이름을 코드에 박지 않는다.** 폐지 대상이던 `業務分類`(BIZ)가 아직 표시 중이라
  // 「비표시 축」이 하나도 없는 상태가 있었고, 그때 이 케이스가 FAIL 로 보여 구현 결함처럼
  // 읽혔다(2026-10-27). 비표시 축이 생기면 자동으로 다시 검증된다.
  const hidden = all.filter((c) => !visible.includes(c));
  if (hidden.length === 0) {
    skip(`비표시 축이 없어 판정할 수 없습니다 — 현재 표시 중: ${visible.join(",")}`);
  }

  // 표시 중인 필수 축만 채운다. 비표시 축은 요구되지 않아야 하므로 저장이 성공해야 한다.
  const required = REQUIRED_AXES.filter((c) => visible.includes(c));
  const ids = required.map((c) => map[c][0]);

  const { status, body } = await post(token, ids);
  assert(
    status === 201,
    `비표시 축(${hidden.join(",")})까지 요구해 거부됐습니다 — HTTP ${status} ${JSON.stringify(body).slice(0, 160)}`,
  );
  await remove(token, body?.data?.id);
});

test("제품상태(레거시 축)는 필수로 요구하지 않는다", async () => {
  const token = await signToken("super");
  const { map, visible } = await axisChildren(token);

  // 제품상태는 형번의 속성으로 옮겨졌다(REQ-007). 카테고리 축이 DB 에 남아 있어도
  // 저장을 막으면 안 된다 — 자료 등록 화면에는 입력란 자체가 없기 때문이다.
  if (!visible.includes(LEGACY_AXIS)) {
    skip(`${LEGACY_AXIS} 축이 표시 대상이 아니어서 판정할 수 없습니다`);
  }

  // 필수 축만 채우고 제품상태는 **일부러 비운다.**
  const ids = REQUIRED_AXES.filter((c) => visible.includes(c)).map((c) => map[c][0]);
  const { status, body } = await post(token, ids);
  assert(
    status === 201,
    `제품상태를 비웠는데 거부됐습니다 — HTTP ${status} ${JSON.stringify(body).slice(0, 160)}`,
  );
  await remove(token, body?.data?.id);
});

// 잔재 정리 — 실패로 남은 `[E2E-REQ]` 자료를 지운다.
// 지운 뒤 **실제로 0건이 됐는지 확인**한다. 종전에는 `assert(true)` 로 무조건 통과시켜,
// 정리가 실패해도 PASS 로 보였다.
test("테스트 잔재를 남기지 않는다", async () => {
  const token = await signToken("super");
  const find = async () => {
    const res = await fetch(
      `${BASE_URL}/api/contents?pageSize=100&status=draft&keyword=${encodeURIComponent("[E2E-REQ]")}`,
      { headers: { cookie: `qp-auth-token=${token}` } },
    );
    return (await res.json())?.data ?? [];
  };

  for (const r of await find()) await remove(token, r.id);
  assertEqual((await find()).length, 0, "잔재를 지우지 못했습니다");
});

process.exitCode = (await run("콘텐츠 축별 필수 분류")) > 0 ? 1 : 0;
