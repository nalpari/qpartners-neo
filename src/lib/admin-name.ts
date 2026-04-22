import { fetchQspUserDetail } from "@/lib/qsp-member";

/**
 * ADMIN 사용자 userId(loginId) 로 `userNm` 을 조회.
 *
 * - QSP `userDetail` API 호출 (userTp=ADMIN)
 * - 실패·에러·빈 userNm → null 반환 (silent degradation — 호출부에서 userId 로 폴백)
 * - 콘텐츠 상세 등 외부 API 장애 시에도 페이지가 렌더되도록 설계
 */
export async function resolveAdminName(
  userId: string,
  logTag: string,
): Promise<string | null> {
  try {
    const result = await fetchQspUserDetail(userId, "ADMIN", logTag, userId);
    if (!result.ok) return null;
    const name = result.detail.userNm?.trim();
    return name && name.length > 0 ? name : null;
  } catch (error) {
    console.warn(`${logTag} resolveAdminName 조회 실패:`, error);
    return null;
  }
}
