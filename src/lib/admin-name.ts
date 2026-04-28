import { z } from "zod";

import { fetchQspUserDetail } from "@/lib/qsp-member";
import { userTpValues } from "@/lib/schemas/common";

const userTypeSchema = z.enum(userTpValues);
// QSP userNm 방어적 검증 — 100자 초과·공백만인 경우 차단
const userNmSchema = z.string().trim().min(1).max(100);

// 후보 userType 우선순위 — 관리자 액션이 가장 흔하므로 ADMIN 을 첫 번째로.
// 첫 매칭에서 short-circuit 되므로 다수 케이스가 1회 호출로 종결.
const ALL_USER_TYPES_PRIORITY = ["ADMIN", "STORE", "SEKO", "GENERAL"] as const;

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

/**
 * userType 모를 때 후보 타입을 순차로 시도해 첫 매칭을 반환.
 *
 * 사용 시나리오: HomeNotice.updatedBy 처럼 갱신자의 userType 컬럼이 DB 에 없는 경우.
 * 작성자(creator)와 다른 userType 의 사용자가 갱신했을 가능성을 커버하면서도
 * 외부 호출 비용을 최소화한다.
 *
 * 동작:
 *  - 후보 타입을 순차로 호출, F_NOT_USER 인 경우만 다음 타입으로 진행.
 *  - 502/네트워크 등 일시 오류는 재시도해도 같은 결과일 가능성이 높아 즉시 중단(폴백 null).
 *  - 매칭 성공 시 즉시 종료(short-circuit). 첫 후보(ADMIN) 매칭이면 1회 호출로 종결.
 *
 * @returns `{ name, resolvedType }` — 모두 실패 시 `{ null, null }`.
 */
export async function resolveUserNameUnknownType(
  userId: string,
  logTag: string,
  candidateTypes: readonly (typeof userTpValues)[number][] = ALL_USER_TYPES_PRIORITY,
): Promise<{ name: string | null; resolvedType: (typeof userTpValues)[number] | null }> {
  for (const userType of candidateTypes) {
    let result;
    try {
      result = await fetchQspUserDetail(userId, userType, logTag, userId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      console.warn(`${logTag} resolveUserNameUnknownType ${userType} 조회 실패: ${msg}`);
      // 일시 오류 → 다른 타입도 같은 인프라 의존이므로 추가 시도하지 않음.
      return { name: null, resolvedType: null };
    }
    if (result.ok) {
      const nmParsed = userNmSchema.safeParse(result.detail.userNm ?? "");
      return {
        name: nmParsed.success ? nmParsed.data : null,
        resolvedType: userType,
      };
    }
    // F_NOT_USER(404)는 다음 타입 시도. 그 외(502 등)는 일시 오류 가능 → 중단.
    if (result.error.status !== 404) {
      return { name: null, resolvedType: null };
    }
  }
  return { name: null, resolvedType: null };
}
