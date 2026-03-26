import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  emailCheckSchema,
  qspEmailCheckResponseSchema,
} from "@/lib/schemas/signup";

// POST /api/auth/email/check — 이메일 중복 체크
export async function POST(request: NextRequest) {
  // TODO: QSP 이메일 중복체크 전용 I/F가 나오면 교체 예정 (현재 I/F 요청중)
  // 현재는 QSP 유저정보 조회 API를 활용하여 존재 여부 판단
  const QSP_USER_INFO_API_URL = process.env.QSP_USER_INFO_API_URL;
  if (!QSP_USER_INFO_API_URL) {
    console.error("[POST /api/auth/email/check] QSP_USER_INFO_API_URL 환경변수 미설정");
    return NextResponse.json(
      { error: "서버 설정 오류입니다" },
      { status: 500 },
    );
  }

  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[POST /api/auth/email/check] Request body 파싱 실패:", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = emailCheckSchema.safeParse(body);
  if (!result.success) {
    // M1: Zod 내부 구조 노출 방지 — 필드명+메시지만 반환
    const fields = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: "Validation failed", fields },
      { status: 400 },
    );
  }

  const { email } = result.data;

  // 2. QSP 유저정보 조회 API로 이메일 존재 여부 확인
  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_USER_INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // M4: 10초 타임아웃
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        userId: email,
        userTp: "GENERAL",
      }),
    });
  } catch (error) {
    console.error("[POST /api/auth/email/check] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  // I6: QSP HTTP 비정상 응답 처리
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
  } catch (error) {
    console.warn("[POST /api/auth/email/check] QSP 응답 JSON 파싱 실패:", error);
    return NextResponse.json(
      { error: "외부 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspEmailCheckResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/email/check] QSP 응답 스키마 불일치:", parsed.error);
    return NextResponse.json(
      { error: "외부 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 존재 여부 판별
  // QSP 유저정보 조회: resultCode === "S" + data 존재 → 이미 등록된 이메일
  const hasUser = qsp.result.resultCode === "S" && qsp.data != null;

  if (hasUser) {
    return NextResponse.json(
      { error: "이미 사용중인 이메일입니다" },
      { status: 409 },
    );
  }

  // resultCode !== "S"이고 data가 null이면 미등록으로 판단
  // QSP 에러(서버 장애 등)는 위 HTTP/스키마 검증에서 걸러짐
  return NextResponse.json({
    data: { available: true, message: "사용 가능한 이메일입니다" },
  });
}
