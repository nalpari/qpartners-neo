import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { emailSchema, qspResponseSchema } from "@/lib/schemas/signup";

// POST /api/auth/email/check — 이메일 중복 체크
//
// QSP userDetail 을 두 키로 병렬 조회한다:
//   1) loginId 단독 → BC_QP_USER.user_id 컬럼 매칭 (newUserReq 가 검사하는 컬럼)
//   2) email   단독 → BC_QP_USER.e_mail   컬럼 매칭 (AS-IS 데이터의 user_id ≠ e_mail 케이스 대응)
// 둘 중 하나라도 hit 또는 다건(TooManyResults) 신호면 409 처리. 양쪽 모두 미존재여야 사용 가능.
// PII(email) 가 URL query 에 노출되지 않도록 클라이언트 → 본 라우트는 POST 사용.

type LookupOutcome =
  | { kind: "found" }
  | { kind: "not-found" }
  | { kind: "ambiguous"; resultCode: string }
  | { kind: "transport-error"; httpStatus: number }
  | { kind: "schema-error" }
  | { kind: "business-error"; resultCode: string };

async function lookupQspUser(
  email: string,
  searchBy: "loginId" | "email",
): Promise<LookupOutcome> {
  const params = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    userTp: "GENERAL",
  });
  params.set(searchBy, email);

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.userDetail}?${params.toString()}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: `[POST /api/auth/email/check] (${searchBy})`,
        userId: maskEmail(email),
        userType: "GENERAL",
      },
    );
  } catch (error) {
    console.error(
      `[POST /api/auth/email/check] QSP API 호출 실패 (${searchBy}):`,
      error,
    );
    return { kind: "transport-error", httpStatus: 0 };
  }

  if (!qspResponse.ok) {
    console.error(
      `[POST /api/auth/email/check] QSP 비정상 응답 (${searchBy}):`,
      qspResponse.status,
    );
    return { kind: "transport-error", httpStatus: qspResponse.status };
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (parseError) {
    console.warn(
      `[POST /api/auth/email/check] QSP 응답 JSON 파싱 실패 (${searchBy}):`,
      parseError,
    );
    return { kind: "schema-error" };
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(
      `[POST /api/auth/email/check] QSP 응답 스키마 불일치 (${searchBy})`,
    );
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
  if (qsp.result.resultCode === "E") {
    console.error(
      `[POST /api/auth/email/check] QSP 다건 매칭 (${searchBy}) — resultCode=E`,
    );
    return { kind: "ambiguous", resultCode: qsp.result.resultCode };
  }

  console.error(
    `[POST /api/auth/email/check] QSP 비즈니스 에러 (${searchBy}):`,
    qsp.result.resultCode,
  );
  return { kind: "business-error", resultCode: qsp.result.resultCode };
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/auth/email/check] JSON parse 실패:", error);
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

    const [byLoginId, byEmail] = await Promise.all([
      lookupQspUser(email, "loginId"),
      lookupQspUser(email, "email"),
    ]);

    // 한쪽이라도 found / ambiguous → 중복
    if (
      byLoginId.kind === "found" ||
      byEmail.kind === "found" ||
      byLoginId.kind === "ambiguous" ||
      byEmail.kind === "ambiguous"
    ) {
      return NextResponse.json(
        { error: "すでに使用されているメールアドレスです" },
        { status: 409 },
      );
    }

    // 양쪽 모두 not-found 인 경우만 사용 가능
    if (byLoginId.kind === "not-found" && byEmail.kind === "not-found") {
      return NextResponse.json({
        data: { available: true, message: "使用可能なメールアドレスです" },
      });
    }

    // 그 외(transport/schema/business error) — 정확 판정 불가, 보수적으로 502
    const message =
      byLoginId.kind === "transport-error" || byEmail.kind === "transport-error"
        ? byLoginId.kind === "transport-error" && byLoginId.httpStatus === 0
          ? "外部サーバーに接続できません"
          : "外部サーバーエラーが発生しました"
        : byLoginId.kind === "schema-error" || byEmail.kind === "schema-error"
          ? "外部サーバーの応答を処理できません"
          : "メール確認中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 502 });
  } catch (error) {
    console.error("[POST /api/auth/email/check]", error);
    return NextResponse.json(
      { error: "メール確認中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
