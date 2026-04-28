"use client";

/**
 * BlockEditor 동적 import 로딩 중 표시되는 placeholder.
 * 본문 영역과 같은 최소 높이를 잡아 layout shift를 최소화한다.
 */
export function BlockEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label="エディタを読み込み中"
      className="w-full min-h-[300px] px-4 py-4 border border-[#EBEBEB] rounded-[6px] bg-white"
    >
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-[#EEE] rounded w-1/3" />
        <div className="h-4 bg-[#EEE] rounded w-2/3" />
        <div className="h-4 bg-[#EEE] rounded w-1/2" />
      </div>
    </div>
  );
}
