"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// 컨텐츠 목록 첫 진입 가이드(코치마크). 브라우저당 1회만 노출 — 닫거나 건너뛰면 다시 뜨지 않는다.
const STORAGE_KEY = "qp-contents-guide-seen";

/**
 * `data-guide` 값 ↔ 말풍선 문구. 대상이 화면에 없으면(모바일 숨김 등) 그 단계는 건너뛴다.
 * 앵커를 못 찾아도 에러가 없으므로 data-guide 를 지우거나 이름을 바꿀 때 이 목록도 함께 고칠 것.
 * 앵커 위치: contents-contents.tsx(mode·facets·list), contents-search.tsx(keyword-op·keyword).
 */
const STEPS = [
  { key: "mode", title: "探し方を選ぶ", body: "資料から探すか、製品（型番）から探すかを選べます。" },
  { key: "facets", title: "カテゴリで絞り込む", body: "カテゴリにチェックを入れると、該当する資料だけを表示できます。複数選ぶこともできます。" },
  { key: "keyword-op", title: "AND／OR検索", body: "キーワードを複数入れたときの検索条件を選べます。\nAND：すべてのキーワードを含む資料\nOR：どれか1つでも含む資料" },
  { key: "keyword", title: "キーワード検索", body: "入力すると候補が表示され、Enterキーで検索できます。\nキーワードを複数入れるときは、スペースで区切ってください。" },
  { key: "list", title: "資料一覧", body: "タイトルをクリックすると、資料の詳細を確認できます。" },
] as const;

const PAD = 6;
const BUBBLE_W = 320;
const GAP = 12;
/** 말풍선 높이 추정치 — 대상 위·아래 어디에도 이만큼 공간이 없으면 대상 안쪽 상단에 겹쳐 띄운다 */
const BUBBLE_MIN_SPACE = 200;
/** 화면 높이 대비 이 비율보다 큰 대상은 center 로 스크롤하면 윗부분이 잘려 start 로 맞춘다 */
const TALL_RATIO = 0.6;
/** 넓은 대상에서 화살표가 가운데가 아니라 왼쪽 근처(이 거리 이내)를 가리키게 한다 */
const ARROW_MAX_OFFSET = 40;

// 구독하지 않는다 — 마운트 중 닫힘은 `closed` state 가 맡고, 다른 탭에서의 변경은 따라가지 않는다(의도).
const noopSubscribe = () => () => {};
function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // 읽기 자체가 막힌 환경(사이트 데이터 차단 등)은 매번 뜨게 되므로 아예 띄우지 않는다.
    // 쓰기만 실패하는 경우는 markSeen 참고.
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // 저장 실패는 무시 — 이번 마운트 동안만 닫히고, 다음 진입 때 다시 뜬다.
  }
}

// 같은 key(mode·facets)가 모바일/데스크톱 양쪽에 있어, 지금 보이는(크기>0) 쪽을 고른다.
function findTarget(key: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-guide="${key}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function ContentsGuideTour() {
  // 서버 스냅샷은 "봤음" — SSR 에서는 그리지 않고 하이드레이션 후 localStorage 로 판정한다.
  const seen = useSyncExternalStore(noopSubscribe, readSeen, () => true);
  const [closed, setClosed] = useState(false);
  const [pos, setPos] = useState(0);
  const [rects, setRects] = useState<(DOMRect | null)[]>([]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** 열리기 직전 포커스 — 닫을 때 되돌린다(다이얼로그 접근성 권장 동작) */
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const open = !seen && !closed;

  const visible = STEPS.map((s, i) => ({ ...s, rect: rects[i] ?? null })).filter((s) => s.rect);
  // 가이드 도중 리사이즈로 보이는 단계 수가 줄어도 표시·이동이 어긋나지 않게 보정한 현재 위치
  const cur = Math.min(pos, visible.length - 1);
  const step = visible[cur];
  const isLast = cur >= visible.length - 1;

  // 대상 위치를 매 프레임 측정 — 스크롤·리사이즈뿐 아니라 오류 문구·필터가 늦게 끼어들어
  // 레이아웃이 밀리는 경우도 따라간다. 값이 바뀐 프레임에만 다시 그린다.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let raf = 0;
    let last = "";
    const tick = () => {
      const next = STEPS.map((s) => findTarget(s.key)?.getBoundingClientRect() ?? null);
      const sig = JSON.stringify(next.map((r) => r && [r.top, r.left, r.width, r.height]));
      if (sig !== last) {
        last = sig;
        setRects(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const stepKey = step?.key;
  useEffect(() => {
    if (!stepKey) return;
    const el = findTarget(stepKey);
    if (el) {
      const tall = el.getBoundingClientRect().height > window.innerHeight * TALL_RATIO;
      el.scrollIntoView({ block: tall ? "start" : "center" });
    }
    nextRef.current?.focus();
  }, [stepKey]);

  const finish = () => {
    markSeen();
    setClosed(true);
    // 배경 inert 해제(effect cleanup) 이후에 포커스를 돌려야 하므로 한 프레임 미룬다
    const prev = prevFocusRef.current;
    requestAnimationFrame(() => prev?.focus());
  };

  // 열려 있는 동안 모달처럼 동작 — 배경을 inert 로 막아 Tab 이 뒤 화면으로 새지 않게 하고,
  // Esc 는 document 에서 받는다(딤 영역 클릭으로 포커스가 body 로 빠져도 닫히도록).
  const shown = open && !!step?.rect;
  useEffect(() => {
    const root = rootRef.current;
    if (!shown || !root) return;
    // 이미 inert 인 요소는 건드리지 않는다 — 닫을 때 남이 건 inert 를 풀지 않도록.
    const others = [...document.body.children].filter(
      (el): el is HTMLElement => el !== root && el instanceof HTMLElement && !el.inert,
    );
    others.forEach((el) => (el.inert = true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      markSeen();
      setClosed(true);
      const prev = prevFocusRef.current;
      requestAnimationFrame(() => prev?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => {
      others.forEach((el) => (el.inert = false));
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  if (!open || !step?.rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = step.rect;
  // 뷰포트 위·아래로 벗어난 부분은 잘라 보이는 영역만 비춘다(가로는 자르지 않음)
  const top = Math.max(r.top, 0) - PAD;
  const bottom = Math.min(r.bottom, vh) + PAD;
  const left = r.left - PAD;
  const width = r.width + PAD * 2;

  const bubbleW = Math.min(BUBBLE_W, vw - 32);
  const bubbleLeft = Math.min(Math.max(r.left, 16), vw - bubbleW - 16);
  const placement = vh - bottom >= BUBBLE_MIN_SPACE ? "below" : top >= BUBBLE_MIN_SPACE ? "above" : "inside";
  const bubbleStyle =
    placement === "below"
      ? { top: bottom + GAP }
      : placement === "above"
        ? { bottom: vh - top + GAP }
        : { top: top + PAD + GAP };
  const arrowLeft = Math.min(Math.max(r.left + Math.min(r.width / 2, ARROW_MAX_OFFSET) - bubbleLeft, 16), bubbleW - 24);

  return createPortal(
    // 전면 오버레이가 클릭을 전부 받는다 — 비춘 대상도 클릭 불가, 딤 클릭으로는 닫히지 않는다.
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contents-guide-title"
      className="fixed inset-0 z-[9999]"
    >
      {/* 스포트라이트 — 큰 box-shadow 로 주변만 어둡게 칠한다(시각 효과 전용, 이벤트는 통과) */}
      <div
        className="pointer-events-none fixed rounded-[8px]"
        style={{ top, left, width, height: bottom - top, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
      />
      <div
        className="fixed rounded-[10px] bg-white p-5 font-['Noto_Sans_JP'] shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
        style={{ ...bubbleStyle, left: bubbleLeft, width: bubbleW }}
      >
        {placement !== "inside" && (
          <span
            aria-hidden
            className="absolute size-3 rotate-45 bg-white"
            style={{ left: arrowLeft, ...(placement === "below" ? { top: -6 } : { bottom: -6 }) }}
          />
        )}
        <p className="text-[12px] text-[#6a88a9]">
          {cur + 1} / {visible.length}
        </p>
        <h2 id="contents-guide-title" className="mt-1 text-[15px] font-bold text-[#e9711c]">
          {step.title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.6] text-[#45576f]">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-[13px] text-[#999] underline">
            スキップ
          </button>
          <div className="flex gap-2">
            {cur > 0 && (
              <button
                type="button"
                onClick={() => setPos(cur - 1)}
                className="rounded-[6px] border border-[#e6eef6] px-4 py-2 text-[13px] text-[#45576f]"
              >
                戻る
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (isLast ? finish() : setPos(cur + 1))}
              className="rounded-[6px] bg-[#246097] px-4 py-2 text-[13px] font-medium text-white"
            >
              {isLast ? "はじめる" : "次へ"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
