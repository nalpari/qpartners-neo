import { fetchQspUserDetail } from "@/lib/qsp-member";
import { userTpValues, type UserTp } from "@/lib/schemas/common";

/**
 * 사용자 userId 로 `userNm` 을 조회.
 *
 * - QSP `userDetail` API 호출 (userTp 명시 전달 — 호출부가 DB의 content.userType 등 신뢰값 전달)
 * - 알 수 없는 userType 또는 QSP 실패·에러·빈 userNm → null 반환
 *   (silent degradation — 호출부에서 userId 로 폴백)
 * - 콘텐츠 상세 등 외부 API 장애 시에도 페이지가 렌더되도록 설계
 */
export async function resolveUserName(
  userType: string,
  userId: string,
  logTag: string,
): Promise<string | null> {
  // userType 검증 — 알 수 없는 값이면 QSP 조회 자체를 생략 (fail-closed)
  if (!(userTpValues as readonly string[]).includes(userType)) {
    console.warn(`${logTag} resolveUserName: 알 수 없는 userType=${userType}, 조회 생략`);
    return null;
  }
  try {
    const result = await fetchQspUserDetail(userId, userType as UserTp, logTag, userId);
    if (!result.ok) return null;
    const name = result.detail.userNm?.trim();
    return name && name.length > 0 ? name : null;
  } catch (error) {
    console.warn(`${logTag} resolveUserName 조회 실패:`, error);
    return null;
  }
}
