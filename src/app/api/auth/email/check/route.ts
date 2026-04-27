import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { emailSchema, qspResponseSchema } from "@/lib/schemas/signup";

// POST /api/auth/email/check — 이메일 중복 체크
//
// QSP userDetail 을 두 키로 병렬 조회한다:
//   1) loginId 단독 → BC_QP_USER.user_id 컬럼 매칭 (newUserReq 가 검사하는 컬럼)
//   2) email   단독 → BC_QP_USER.e_mail   컬럼 매칭 (AS-IS 데이터의 user_id ≠ e_mail 케이스 대응)
// 둘 중 하나라도 hit 또는 다건(TooManyResults) 신호면 409. 양쪽 모두 미존재여야 사용 가능.
// PII(email) 가 URL query 에 노출되지 않도록 클라이언트 → 본 라우트는 POST 사용.
//
// race: 본 체크와 newUserReq 사이는 원자적이지 않다. 동시 가입 시 동일 e_mail 다중 생성 여지는
// QSP newUserReq 정책 보강(별도 트랙)으로 해결한다.

const LOG = "[POST /api/auth/email/check]";
const QSP_TIMEOUT_MS = 10_000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
// IP 차원: 동일 IP 의 분산 enumeration 시도 차단 (1h 내 30회).
const RATE_IP_LIMIT = 30;
// Email 차원: 동일 이메일 표적 enumeration 시도 차단 (1h 내 10회).
// 두 차원은 독립 적용 — 한쪽이라도 초과 시 429. IP 가 없으면 Email 차원만 적용 → effective 10/h.
const RATE_EMAIL_LIMIT = 10;

// 외부 시스템 헬스 추론을 막기 위해 502 응답은 단일 메시지로 통일.
const GENERIC_UPSTREAM_ERROR = "メール確認中にエラーが発生しました";

type LookupOutcome =
  | { kind: "found" }
  | { kind: "not-found" }
  | { kind: "ambiguous"; resultCode: string }
  | { kind: "transport-error"; httpStatus: number }
  | { kind: "schema-error" }
  | { kind: "business-error"; resultCode: string }
  | { kind: "aborted" };

// 컬럼명(loginId/email) 추론 단서를 차단하기 위해 외부에 노출되는 라벨은 1/2 로 익명화.
type LookupId = 1 | 2;
type SearchBy = "loginId" | "email";

async function lookupQspUser(
  email: string,
  searchBy: SearchBy,
  lookupId: LookupId,
  externalSignal: AbortSignal,
): Promise<LookupOutcome> {
  const params = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    userTp: "GENERAL",
  });
  params.set(searchBy, email);

  const signal = AbortSignal.any([
    externalSignal,
    AbortSignal.timeout(QSP_TIMEOUT_MS),
  ]);

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.userDetail}?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        signal,
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: `${LOG} (lookup#${lookupId})`,
        userId: maskEmail(email),
        userType: "GENERAL",
      },
    );
  } catch (error) {
    if (externalSignal.aborted) {
      // race winner 가 abort 시킨 경우 — 정상 fast-path. 디버깅 noise 회피.
      return { kind: "aborted" };
    }
    // AbortError 는 timeout(QSP_TIMEOUT_MS 초과) 이 유일한 발생 경로.
    // 디버깅 시 일반 transport error(네트워크/DNS) 와 구분되도록 warn 로 기록.
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`${LOG} QSP API timeout (lookup#${lookupId})`);
      return { kind: "transport-error", httpStatus: 0 };
    }
    console.error(`${LOG} QSP API 호출 실패 (lookup#${lookupId}):`, error);
    return { kind: "transport-error", httpStatus: 0 };
  }

  if (!qspResponse.ok) {
    console.error(
      `${LOG} QSP 비정상 응답 (lookup#${lookupId}):`,
      qspResponse.status,
    );
    return { kind: "transport-error", httpStatus: qspResponse.status };
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (parseError) {
    console.warn(
      `${LOG} QSP 응답 JSON 파싱 실패 (lookup#${lookupId}):`,
      parseError,
    );
    return { kind: "schema-error" };
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(`${LOG} QSP 응답 스키마 불일치 (lookup#${lookupId})`);
    return { kind: "schema-error" };
  }

  const qsp = parsed.data;

  if (qsp.result.resultCode === "F_NOT_USER") {
    return { kind: "not-found" };
  }

  if (qsp.result.resultCode === "S") {
    // resultCode "S" + data 있음 → 매칭된 회원 존재
    // resultCode "S" + data null → 매칭 없음으로 간주
    return qsp.data != null ? { kind: "found" } : { kind: "not-found" };
  }

  // resultCode "E" — TooManyResultsException 등 동일 키로 다건 매칭 신호.
  // 매칭되는 회원이 둘 이상이라는 의미이므로 중복으로 간주 (보수적).
  // [trade-off] QSP 가 다른 비즈니스 에러도 "E" 로 응답할 가능성이 있어
  //   AS-IS 데이터 오염 시 정상 신규 가입자가 차단되는 false-positive 우려가 있다.
  //   대안: QSP 응답 message 를 추가로 검사해 TooManyResults 만 ambiguous 로 분류.
  //   본 PR 범위 외(QSP 응답 사양 확인 필요) — 현재는 안전 우선으로 차단.
  if (qsp.result.resultCode === "E") {
    console.error(
      `${LOG} QSP 다건 매칭 (lookup#${lookupId}) — resultCode=E`,
    );
    return { kind: "ambiguous", resultCode: qsp.result.resultCode };
  }

  console.error(
    `${LOG} QSP 비즈니스 에러 (lookup#${lookupId}):`,
    qsp.result.resultCode,
  );
  return { kind: "business-error", resultCode: qsp.result.resultCode };
}

function isDecisive(outcome: LookupOutcome): boolean {
  return outcome.kind === "found" || outcome.kind === "ambiguous";
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn(`${LOG} JSON parse 실패:`, error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const email =
      typeof body === "object" && body !== null && "email" in body
        ? (body as Record<string, unknown>).email
        : undefined;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "メールアドレスは必須です" },
        { status: 400 },
      );
    }

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 },
      );
    }

    // Email 정규화 — rate limit 키 / QSP lookup / 로그 마스킹의 baseline 일관성 확보.
    // 대소문자만 다른 표기로 enumeration rate limit 우회되는 케이스(`A@x.com` vs `a@x.com`) 차단.
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit — public endpoint + QSP 호출 2배 → enumeration / DoS 증폭 방어.
    // [전제] 배포 환경의 리버스 프록시(Nginx/ALB)가 클라이언트 x-forwarded-for를 덮어씀.
    //        프록시 없이 직접 노출 시 헤더 스푸핑 가능 → email 차원 키로 보완.
    // 두 차원 모두 독립 적용 — IP 차원은 분산 enumeration, Email 차원은 표적 enumeration 차단.
    const forwarded = request.headers.get("x-forwarded-for");
    const forwardedFirst = forwarded?.split(",")[0]?.trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    const ip =
      forwardedFirst && forwardedFirst.length > 0
        ? forwardedFirst
        : realIp && realIp.length > 0
          ? realIp
          : null;

    if (
      ip &&
      !checkRateLimit(`email-check:ip:${ip}`, RATE_IP_LIMIT, RATE_WINDOW_MS)
    ) {
      return NextResponse.json(
        {
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        },
        { status: 429 },
      );
    }
    if (
      !checkRateLimit(
        `email-check:email:${normalizedEmail}`,
        RATE_EMAIL_LIMIT,
        RATE_WINDOW_MS,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — email 차원 rate limit 만 적용`);
    }

    // 두 lookup 을 동일 AbortController 로 병렬 시작.
    // 한쪽이 found/ambiguous (결정적 결과) 로 빠르게 끝나면 즉시 다른 쪽 abort →
    // 한쪽이 hang 시 최악 10s 대기 회피.
    // [trade-off] happy path(양쪽 모두 not-found) 에서 먼저 끝난 쪽이 not-found 면 abort 트리거 안 됨 →
    //   다른 쪽이 hang 일 경우 timeout(10s) 까지 대기. race 효과는 결정적 결과 때만.
    //   둘 다 결과를 봐야 안전한 판정이 가능하므로 의도된 trade-off.
    const ac = new AbortController();
    const p1: Promise<{ id: 1; outcome: LookupOutcome }> = lookupQspUser(
      normalizedEmail,
      "loginId",
      1,
      ac.signal,
    ).then((outcome) => ({ id: 1, outcome }));
    const p2: Promise<{ id: 2; outcome: LookupOutcome }> = lookupQspUser(
      normalizedEmail,
      "email",
      2,
      ac.signal,
    ).then((outcome) => ({ id: 2, outcome }));

    const first = await Promise.race([p1, p2]);
    if (isDecisive(first.outcome)) {
      ac.abort();
      return NextResponse.json(
        { error: "すでに使用されているメールアドレスです" },
        { status: 409 },
      );
    }

    const settled = await Promise.all([p1, p2]);
    const [byLoginId, byEmail] = [settled[0].outcome, settled[1].outcome];

    if (isDecisive(byLoginId) || isDecisive(byEmail)) {
      return NextResponse.json(
        { error: "すでに使用されているメールアドレスです" },
        { status: 409 },
      );
    }

    if (byLoginId.kind === "not-found" && byEmail.kind === "not-found") {
      return NextResponse.json({
        data: { available: true, message: "使用可能なメールアドレスです" },
      });
    }

    // 그 외(transport / schema / business error) — 정확 판정 불가, 보수적으로 502.
    // 외부 시스템 헬스 추론 차단을 위해 메시지 분기 없이 단일화.
    return NextResponse.json(
      { error: GENERIC_UPSTREAM_ERROR },
      { status: 502 },
    );
  } catch (error) {
    console.error(LOG, error);
    return NextResponse.json(
      { error: GENERIC_UPSTREAM_ERROR },
      { status: 500 },
    );
  }
}
