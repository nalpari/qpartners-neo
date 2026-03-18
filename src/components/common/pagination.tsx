"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageGroupSize?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageGroupSize = 10,
}: PaginationProps) {
  if (totalPages <= 0) return null;

  const currentGroup = Math.ceil(currentPage / pageGroupSize);
  const startPage = (currentGroup - 1) * pageGroupSize + 1;
  const endPage = Math.min(startPage + pageGroupSize - 1, totalPages);
  const pages = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  return (
    <div className="flex items-center justify-center gap-[5px]">
      {/* 첫 페이지 << */}
      <button
        type="button"
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        className="flex items-center justify-center size-6 border border-[#eaeaea] disabled:opacity-40"
        aria-label="最初のページ"
      >
        <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
          <path d="M3.5 0L0.5 3L3.5 6" stroke="#808080" strokeWidth="1" />
          <path d="M6.5 0L3.5 3L6.5 6" stroke="#808080" strokeWidth="1" />
        </svg>
      </button>

      {/* 이전 그룹 < */}
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, startPage - 1))}
        disabled={currentGroup === 1}
        className="flex items-center justify-center size-6 border border-[#eaeaea] disabled:opacity-40"
        aria-label="前のページ"
      >
        <svg width="3" height="6" viewBox="0 0 3 6" fill="none">
          <path d="M3 0L0 3L3 6" stroke="#808080" strokeWidth="1" />
        </svg>
      </button>

      {/* 페이지 번호 */}
      {pages.map((page) => {
        const isActive = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={`flex items-center justify-center size-6 border font-pretendard text-[12px] tracking-[-0.3px] ${
              isActive
                ? "border-[#92a3b6] text-[#304961] font-semibold"
                : "border-[#eaeaea] text-[#808080] font-normal"
            }`}
          >
            {page}
          </button>
        );
      })}

      {/* 다음 그룹 > */}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, endPage + 1))}
        disabled={endPage >= totalPages}
        className="flex items-center justify-center size-6 border border-[#eaeaea] disabled:opacity-40"
        aria-label="次のページ"
      >
        <svg width="3" height="6" viewBox="0 0 3 6" fill="none">
          <path d="M0 0L3 3L0 6" stroke="#808080" strokeWidth="1" />
        </svg>
      </button>

      {/* 마지막 페이지 >> */}
      <button
        type="button"
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center size-6 border border-[#eaeaea] disabled:opacity-40"
        aria-label="最後のページ"
      >
        <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
          <path d="M0.5 0L3.5 3L0.5 6" stroke="#808080" strokeWidth="1" />
          <path d="M3.5 0L6.5 3L3.5 6" stroke="#808080" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
