/**
 * NEW / UPDATE 배지 — 목업 `.tag.new` / `.tag.upd`
 * (`qpartners-mockups/01-search.html:270~273`).
 *
 * 목업은 **클래스 하나**(`.tag`)를 전 화면이 공유한다. neo 는 자료일람·홈 카드·제품상세에
 * 각각 하드코딩해 두었다가 제품상세만 주황/회색 흰글자가 되어 어긋났다(Redmine #2744).
 * 색·크기를 바꿀 일이 생기면 **이 파일만** 고친다.
 *
 * NEW 우선순위(동시 충족 시 UPDATE 숨김)는 서버 `resolveBadgeFlags` 가 이미 반영해 내려주지만,
 * 호출처가 플래그를 따로 조립하는 경우가 있어 여기서도 NEW 를 먼저 본다.
 */
const TONE = {
  new: "bg-[#F4F9FD] border-[#E3EFFB] text-[#63A5F2]",
  updated: "bg-[#FFF3F8] border-[#F8E3EB] text-[#BC6E8D]",
} as const;

const BASE =
  "inline-flex items-center justify-center px-2 py-[2px] rounded-[4px] border font-pretendard font-medium text-[13px] leading-[1.5] whitespace-nowrap";

interface ContentStateBadgeProps {
  isNew: boolean;
  /** 「수정됨」 판정 — 호출처가 `hasBeenUpdated && isUpdated` 처럼 조립해 넘긴다 */
  isUpdated: boolean;
  /**
   * 배치용 추가 클래스. 목록 셀처럼 좁은 곳에서는 `shrink-0` 을,
   * 밑줄이 걸린 링크/버튼 안에서는 `no-underline` 을 함께 넘긴다.
   */
  className?: string;
}

export function ContentStateBadge({ isNew, isUpdated, className = "" }: ContentStateBadgeProps) {
  if (isNew) {
    return <span className={`${BASE} ${TONE.new} ${className}`}>NEW</span>;
  }
  if (isUpdated) {
    return <span className={`${BASE} ${TONE.updated} ${className}`}>UPDATE</span>;
  }
  return null;
}
