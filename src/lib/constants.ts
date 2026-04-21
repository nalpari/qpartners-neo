/** 페이지 사이즈 SelectBox 옵션 — 공통코드 조회 실패 시 fallback. 라벨은 DB 의 codeName("XX件") 포맷과 일치. */
export const PAGE_SIZE_OPTIONS_FALLBACK: { value: string; label: string }[] = [
  { value: "20", label: "20件" },
  { value: "50", label: "50件" },
  { value: "100", label: "100件" },
];

/** AG Grid 셀 중앙 정렬 스타일 */
export const CENTER_CELL_STYLE = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
