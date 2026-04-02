import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { emailSchema, qspResponseSchema } from "@/lib/schemas/signup";

// POST /api/auth/email/check — 이메일 중복 체크 (QSP /user/detail 활용)
// PII(이메일)가 URL query parameter에 노출되지 않도록 POST 사용
export async function POST(request: NextRequest) {
 try {
  // 1. Request body에서 email 추출 + 검증
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
      { error: "email은 필수입니다" },
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

  // 2. QSP /user/detail GET 호출 (서버→QSP는 GET 유지)
  const params = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email,
    userTp: "GENERAL",
  });

  let qspResponse: Response;
  try {
    qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[POST /api/auth/email/check] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/email/check] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 서버 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱 + Zod 스키마 검증
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (parseError) {
    console.warn("[POST /api/auth/email/check] QSP 응답 JSON 파싱 실패:", parseError);
    return NextResponse.json(
      { error: "외부 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/email/check] QSP 응답 스키마 불일치");
    return NextResponse.json(
      { error: "외부 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 존재 여부 판별
  if (qsp.result.resultCode === "F_NOT_USER") {
    // 유저 없음 → 사용 가능
    return NextResponse.json({
      data: { available: true, message: "사용 가능한 이메일입니다" },
    });
  }

  if (qsp.result.resultCode !== "S") {
    // 그 외 비즈니스 에러 → 502
    console.error("[POST /api/auth/email/check] QSP 비즈니스 에러:", qsp.result.resultCode);
    return NextResponse.json(
      { error: "이메일 확인 중 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  // resultCode === "S" + data 존재 → 이미 등록된 이메일
  if (qsp.data != null) {
    return NextResponse.json(
      { error: "이미 사용중인 이메일입니다" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    data: { available: true, message: "사용 가능한 이메일입니다" },
  });
 } catch (error) {
    console.error("[POST /api/auth/email/check]", error);
    return NextResponse.json(
      { error: "メール確認中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
