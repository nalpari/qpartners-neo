/**
 * 제품상태 배지 — 목업 `.badge.ok` / `.badge.eol` 의 단일 출처.
 *
 * 제품상태는 **형번의 속성**이고(REQ-007), 같은 모양의 배지를 쓰는 화면이 넷이다:
 *   - 형번관리 목록 (`03-admin-models.html:400`)
 *   - 제품일람 행   (`01-search.html:1854` `statusBadge`)
 *   - 제품상세 헤더 (`:2127`)
 *   - 자료상세 형번 칩 (`:2007`)
 *
 * ⚠️ **자료일람만 배지가 아니라 텍스트**다 (`statusLabel`) — 연결 형번이 없으면 「-」 를
 * 찍어야 하는데 배지에는 그 상태가 없다. 그쪽은 이 컴포넌트를 쓰지 않는다.
 *
 * 색은 목업 토큰(`assets/qp-tokens.css:53-54`) 그대로다. **販売終了品은 적색이 아니라
 * 주황 계열**이다 — 적색은 사내전용 표기에 쓰고 있어 의미가 겹치면 안 된다.
 *
 * ⚠️ `w-fit` · `h-[24px]` · `shrink-0` 이 필요하다. ag-grid 셀 래퍼(`.ag-cell-value`)가
 * `flex: 1 1 auto` 라, 크기를 묶지 않으면 배지가 **셀 전체를 채운다**(배경색이 칸 전체로
 * 번진다). 높이는 같은 그리드의 `表示／非表示` 배지와 맞췄다.
 */

/** 목업 토큰: `--ok-*` / `--eol-*` */
const STYLE = {
  current: {
    label: "現行品",
    box: "bg-[#EAF6EE] border-[#CFE7D8] text-[#2E6B3E]",
    dot: "bg-[#3E8A4E]",
  },
  eol: {
    label: "販売終了品",
    box: "bg-[#FBF0E3] border-[#F0DCC2] text-[#8A5A22]",
    dot: "bg-[#C07A2E]",
  },
} as const;

export function ProductStatusBadge({ status }: { status: "current" | "eol" }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex h-[24px] w-fit shrink-0 items-center gap-[5px] self-center whitespace-nowrap rounded-[4px] border px-[8px] font-['Noto_Sans_JP'] text-[13px] font-medium ${s.box}`}
    >
      <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
