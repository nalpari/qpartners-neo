"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// 컨텐츠 목록 첫 진입 가이드(코치마크). 브라우저당 1회만 노출 — 닫거나 건너뛰면 다시 뜨지 않는다.
const STORAGE_KEY = "qp-contents-guide-seen";

/** `data-guide` 값 ↔ 말풍선 문구. 대상이 화면에 없으면(모바일 숨김 등) 그 단계는 건너뛴다. */
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

const noopSubscribe = () => () => {};
function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // 저장소를 못 쓰면 매번 뜨게 되므로 아예 띄우지 않는다
  }
}

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
  const open = !seen && !closed;

  const visible = STEPS.map((s, i) => ({ ...s, rect: rects[i] ?? null })).filter((s) => s.rect);
  const step = visible[Math.min(pos, visible.length - 1)];
  const isLast = pos >= visible.length - 1;

  // 대상 위치를 매 프레임 측정 — 스크롤·리사이즈뿐 아니라 오류 문구·필터가 늦게 끼어들어
  // 레이아웃이 밀리는 경우도 따라간다. 값이 바뀐 프레임에만 다시 그린다.
  useEffect(() => {
    if (!open) return;
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
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
      el.scrollIntoView({ block: tall ? "start" : "center" });
    }
    nextRef.current?.focus();
  }, [stepKey]);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 저장 실패 시에도 이번 화면에서는 닫는다
    }
    setClosed(true);
  };

  if (!open || !step?.rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = step.rect;
  // 화면보다 큰 대상(목록·필터)은 보이는 부분만 비춘다
  const top = Math.max(r.top, 0) - PAD;
  const bottom = Math.min(r.bottom, vh) + PAD;
  const left = r.left - PAD;
  const width = r.width + PAD * 2;

  const bubbleW = Math.min(BUBBLE_W, vw - 32);
  const bubbleLeft = Math.min(Math.max(r.left, 16), vw - bubbleW - 16);
  const placement = vh - bottom >= 200 ? "below" : top >= 200 ? "above" : "inside";
  const bubbleStyle =
    placement === "below"
      ? { top: bottom + GAP }
      : placement === "above"
        ? { bottom: vh - top + GAP }
        : { top: top + PAD + GAP };
  const arrowLeft = Math.min(Math.max(r.left + Math.min(r.width / 2, 40) - bubbleLeft, 16), bubbleW - 24);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contents-guide-title"
      className="fixed inset-0 z-[9999]"
      onKeyDown={(e) => e.key === "Escape" && finish()}
    >
      {/* 스포트라이트 — 큰 그림자로 주변을 어둡게 덮고 대상만 뚫어 보인다. 클릭은 막는다. */}
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
          {pos + 1} / {visible.length}
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
            {pos > 0 && (
              <button
                type="button"
                onClick={() => setPos(pos - 1)}
                className="rounded-[6px] border border-[#e6eef6] px-4 py-2 text-[13px] text-[#45576f]"
              >
                戻る
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (isLast ? finish() : setPos(pos + 1))}
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
