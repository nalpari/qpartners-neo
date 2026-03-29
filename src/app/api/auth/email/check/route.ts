import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";
import { QSP_API } from "@/lib/config";

// QSP /user/detail 응답 스키마
const qspUserDetailResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
});

// GET /api/auth/email/check?email=... — 이메일 중복 체크 (QSP /user/detail 활용)
export async function GET(request: NextRequest) {
  // 1. query parameter에서 email 추출 + 검증
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email 파라미터는 필수입니다" },
      { status: 400 },
    );
  }

  const emailSchema = z.string().email("유효한 이메일 주소를 입력해주세요");
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

  const parsed = qspUserDetailResponseSchema.safeParse(qspBody);
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
