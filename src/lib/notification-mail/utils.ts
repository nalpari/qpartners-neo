import type { NextRequest } from "next/server";

/**
 * 클라이언트 IP 추출 — `auto-login/inbound/route.ts` 와 동일 정책.
 * x-forwarded-for(첫번째) → x-real-ip 순으로 시도, 모두 없으면 null 반환.
 *
 * 사용처:
 *   - `login-mail.ts` 본문의 `IPアドレス` 표기 (Redmine #2125)
 *   - 추출 불가 시 호출부에서 `不明` 폴백 처리
 *
 * 보안 주의:
 *   - 본 헬퍼 결과를 로그에 평문으로 출력 금지 (PII 정책, `.claude/rules/api.md`)
 *   - 메일 본문 표기는 정책상 허용 (사용자 본인이 자기 IP 를 인지하는 용도)
 */
export function extractClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real?.trim() || null;
}
