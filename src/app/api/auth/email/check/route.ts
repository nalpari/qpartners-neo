import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { emailSchema, qspResponseSchema } from "@/lib/schemas/signup";

// POST /api/auth/email/check — 이메일 중복 체크 (QSP /user/detail 활용)
// PII(이메일)가 URL query parameter에 노출되지 않도록 POST 사용
export async function POST(request: NextRequest) {
  // 1. Request body에서 email 추출 + 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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

  // 2. QSP /user/detail GET 호출 (이메일로 유저 존재 여부 확인)
  const params = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email,
    userTp: "GENERAL",
  });

  let qspResponse: Response;
  try {
    qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
      method: "GET",
      // M4: 10초 타임아웃
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("[GET /api/auth/email/check] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  // I6: QSP HTTP 비정상 응답 처리
  if (!qspResponse.ok) {
    console.error("[GET /api/auth/email/check] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 서버 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱 + Zod 스키마 검증
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error) {
    console.warn("[GET /api/auth/email/check] QSP 응답 JSON 파싱 실패:", error);
    return NextResponse.json(
      { error: "외부 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[GET /api/auth/email/check] QSP 응답 스키마 불일치:", parsed.error);
    return NextResponse.json(
      { error: "외부 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 존재 여부 판별
  // resultCode === "S" + data 존재 → 이미 등록된 이메일
  const hasUser = qsp.result.resultCode === "S" && qsp.data != null;

  if (hasUser) {
    return NextResponse.json(
      { error: "이미 사용중인 이메일입니다" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    data: { available: true, message: "사용 가능한 이메일입니다" },
  });
}
