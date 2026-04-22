import { z } from "zod";

import { fetchQspUserDetail } from "@/lib/qsp-member";
import { userTpValues } from "@/lib/schemas/common";

const userTypeSchema = z.enum(userTpValues);
// QSP userNm 방어적 검증 — 100자 초과·공백만인 경우 차단
const userNmSchema = z.string().trim().min(1).max(100);

/**
 * 사용자 userId 로 `userNm` 을 조회.
 *
 * - QSP `userDetail` API 호출 (userType 명시 전달 — 호출부가 DB의 content.userType 등 신뢰값 전달)
 * - 알 수 없는 userType(Zod safeParse 실패) · QSP 실패 · userNm 검증 실패 → null 반환
 *   (silent degradation — 호출부에서 userId 로 폴백)
 * - 콘텐츠 상세 등 외부 API 장애 시에도 페이지가 렌더되도록 설계
 */
export async function resolveUserName(
  userType: string,
  userId: string,
  logTag: string,
): Promise<string | null> {
  const userTpParsed = userTypeSchema.safeParse(userType);
  if (!userTpParsed.success) {
    console.warn(`${logTag} resolveUserName: 알 수 없는 userType, 조회 생략`);
    return null;
  }
  try {
    const result = await fetchQspUserDetail(userId, userTpParsed.data, logTag, userId);
    if (!result.ok) return null;
    const nmParsed = userNmSchema.safeParse(result.detail.userNm ?? "");
    return nmParsed.success ? nmParsed.data : null;
  } catch (error) {
    // error 객체 전체 로깅은 PII/스택 노출 위험 → message 만 추출
    const msg = error instanceof Error ? error.message : "unknown";
    console.warn(`${logTag} resolveUserName 조회 실패: ${msg}`);
    return null;
  }
}
