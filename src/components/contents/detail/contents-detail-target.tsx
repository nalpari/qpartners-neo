"use client";

import { useTargetLabels } from "@/hooks/use-target-labels";

// Design Ref: §4.3 — 게시대상 표시 (Target Dynamic from Role 후)
// 라벨/활성 상태는 useTargetLabels 훅으로 권한관리(qp_roles) 와 동기화.
// 신규 권한 D 도 자동 표시. 비회원(roleCode=null) 은 sentinel.

interface TargetItem {
  id: number;
  roleCode: string | null;
  startAt: string | null;
  endAt: string | null;
}

interface ContentsDetailTargetProps {
  targets: TargetItem[];
}

function formatPeriod(startAt: string | null, endAt: string | null): string {
  if (!startAt && !endAt) return "-";
  const fmt = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");
  const start = startAt ? fmt(startAt) : "";
  const end = endAt ? fmt(endAt) : "";
  return `${start}~${end}`;
}

export function ContentsDetailTarget({ targets }: ContentsDetailTargetProps) {
  // contentTargetOptions: SUPER_ADMIN/ADMIN 제외 — 사내회원은 게시대상과 무관하게 항상 조회 가능.
  const { resolveLabel, contentTargetOptions: allOptions, sortByOrder } = useTargetLabels();

  // 권한관리 활성 목록 + 비회원 sentinel — allOptions 정렬 그대로 사용.
  // 콘텐츠에 등록된 게시대상(targets) 만 active 표시, 나머지는 grayed out.
  // sortedTargets(MO 노출)는 allOptions 의 roleCode 화이트리스트로 한 번 더 거름 —
  // 기존 데이터에 SUPER_ADMIN/ADMIN 타깃이 남아 있어도 상세 화면에 표시되지 않도록.
  const visibleRoleCodes = new Set(allOptions.map((o) => o.roleCode));
  const targetMap = new Map(targets.map((t) => [t.roleCode ?? "__NON_MEMBER__", t]));
  const sortedTargets = sortByOrder(targets).filter((t) => visibleRoleCodes.has(t.roleCode));

  // 표시는 모든 옵션을 노출하고 active/inactive 만 다르게 — 기존 디자인 보존.
  // 단 옵션이 동적 길이라 grid 자동 wrapping.
  return (
    <>
      {/* PC: th 한 줄 + td 5열 grid (옵션 6개 이상이면 아래 줄로 wrap) */}
      <div className="hidden lg:block bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] p-6 w-[1440px]">
        <div className="flex gap-1">
          {/* Th: 投稿対象 — self-stretch 로 td grid 전체 높이만큼 늘어남 */}
          <div className="w-[120px] shrink-0 flex items-center bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 py-3 self-stretch">
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] whitespace-nowrap">
              投稿対象
            </span>
          </div>
          {/* Td: 한 줄당 5칸, 옵션이 6개 이상이면 아래 줄로 자동 블록 배치 */}
          <div className="flex-1 grid grid-cols-5 gap-1">
            {allOptions.map((opt) => {
              const key = opt.roleCode ?? "__NON_MEMBER__";
              const matched = targetMap.get(key);
              const active = !!matched;

              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 bg-white border border-[#EAF0F6] rounded-[6px] pl-4 pr-2 justify-center py-3"
                >
                  <span
                    className={`inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] truncate ${
                      active
                        ? "bg-[#EFF7FF] text-[#1060B4] font-medium"
                        : "bg-[#F3F3F3] text-[#101010] font-normal"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                    {active ? formatPeriod(matched.startAt, matched.endAt) : "-"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MO: 세로 나열 — 정렬된 활성 게시대상만 */}
      <div className="block lg:hidden bg-white px-6 py-[34px] w-full">
        <div className="flex flex-col gap-6">
          <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576F] mb-1">
            投稿対象
          </p>
          {sortedTargets.length === 0 ? (
            <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
              -
            </p>
          ) : (
            sortedTargets.map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                <span className="inline-flex items-center justify-center self-start px-2 py-[2px] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] bg-[#EFF7FF] text-[#1060B4] font-medium">
                  {resolveLabel(t.roleCode)}
                </span>
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {formatPeriod(t.startAt, t.endAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
