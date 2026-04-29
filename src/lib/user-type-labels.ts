import { prisma } from "@/lib/prisma";
import { USER_TYPE_LABEL } from "@/lib/schemas/member";

/**
 * userTp(영문 코드) → 화면표시 라벨 매핑을 코드관리 USER_TYPE 디테일로부터 조회.
 *
 * 동기 `lookupUserTypeLabel()` 은 hardcoded fallback 만 보지만, 본 함수는 DB 의 코드관리
 * 디테일을 사용해 운영자가 코드관리 화면에서 codeName 을 변경하면 회원관리 응답 라벨에
 * 즉시 반영되도록 한다.
 *
 * 캐시 정책:
 *   - in-memory map + 5분 TTL — 매 요청마다 DB 왕복 회피
 *   - 코드관리 mutation 시 `invalidateUserTypeLabelCache()` 호출로 TTL 무시 즉시 무효화
 *   - DB 헤더 미등록·조회 실패 시 hardcoded `USER_TYPE_LABEL` 로 폴백 (세션 영속성 유지)
 */

const TTL_MS = 5 * 60 * 1000;

let cached: Map<string, string> | null = null;
let cachedAt = 0;

function buildFallback(): Map<string, string> {
  return new Map(Object.entries(USER_TYPE_LABEL));
}

export async function getUserTypeLabelMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;

  try {
    const header = await prisma.codeHeader.findFirst({
      where: { headerCode: "USER_TYPE", isActive: true },
      select: { id: true },
    });
    if (!header) {
      // 코드관리에 USER_TYPE 헤더 미등록·비활성 → fallback 만 사용.
      cached = buildFallback();
      cachedAt = now;
      return cached;
    }
    const details = await prisma.codeDetail.findMany({
      where: { headerId: header.id, isActive: true },
      select: { code: true, codeName: true },
    });
    const map = new Map<string, string>(details.map((d) => [d.code, d.codeName]));
    // hardcoded fallback merge — DB 미등록 키도 폴백으로 보장 (운영중 누락 방어).
    for (const [k, v] of Object.entries(USER_TYPE_LABEL)) {
      if (!map.has(k)) map.set(k, v);
    }
    cached = map;
    cachedAt = now;
    return cached;
  } catch (err) {
    console.warn("[getUserTypeLabelMap] DB 조회 실패 — hardcoded fallback 사용:", err);
    return buildFallback();
  }
}

/** 코드관리 USER_TYPE 변경 시 즉시 반영을 위해 캐시 비움. */
export function invalidateUserTypeLabelCache(): void {
  cached = null;
  cachedAt = 0;
}
