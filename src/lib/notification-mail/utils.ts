import type { NextRequest } from "next/server";

/**
 * 클라이언트 IP 추출 — `auto-login/inbound/route.ts` 와 동일 정책.
 * x-forwarded-for(첫번째) → x-real-ip 순으로 시도, 모두 없으면 null 반환.
 *
 * 사용처:
 *   - `login-mail.ts` 본문의 `IPアドレス` 표기 (Redmine #2125)
 *   - 추출 불가 시 호출부에서 `不明` 폴백 처리
 *
 * 신뢰 전제 (XFF 스푸핑 정책):
 *   - 본 서비스는 Nginx/LB 리버스 프록시 뒤에서 동작하며, 프록시가 클라이언트 헤더의
 *     X-Forwarded-For 를 신뢰할 수 있는 값으로 재작성/append 한다는 인프라 가정에
 *     의존한다 (앞단 프록시 없는 직노출 환경에서는 클라이언트가 위조 가능).
 *   - 본 결과는 메일 본문 표기 전용이며, rate limit / 인증 / 권한 판단에는 사용하지
 *     않는다. 위조되어도 사용자 본인이 받는 알림 메일의 표기 한 줄만 영향받는다.
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
