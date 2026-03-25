import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  loginRequestSchema,
  qspLoginResponseSchema,
} from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { signToken, COOKIE_NAME } from "@/lib/jwt";

const QSP_LOGIN_API_URL = process.env.QSP_LOGIN_API_URL;

// POST /api/auth/login — QSP 로그인 프록시
export async function POST(request: NextRequest) {
  if (!QSP_LOGIN_API_URL) {
    console.error("[POST /api/auth/login] QSP_LOGIN_API_URL 환경변수 미설정");
    return NextResponse.json(
      { error: "서버 설정 오류입니다" },
      { status: 500 },
    );
  }

  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = loginRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  // 2. QSP API 호출
  const { loginId, pwd, userTp } = result.data;

  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_LOGIN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginId,
        pwd,
        userTp,
        accsSiteCd: "QPARTNERS",
        actLog: "LOGOUT",
        requestId: crypto.randomUUID(),
      }),
    });
  } catch (error) {
    console.error("[POST /api/auth/login] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 인증 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch {
    console.error("[POST /api/auth/login] QSP 응답 파싱 실패");
    return NextResponse.json(
      { error: "외부 인증 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspLoginResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/login] QSP 응답 스키마 불일치:", parsed.error);
    return NextResponse.json(
      { error: "외부 인증 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 성공/실패 판별
  if (qsp.result.resultCode !== "S" || !qsp.data) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 },
    );
  }

  // 5. 클라이언트에 전달할 사용자 정보 추출
  const user: LoginUser = {
    userId: qsp.data.userId,
    userNm: qsp.data.userNm,
    userTp: qsp.data.userTp,
    compCd: qsp.data.compCd,
    compNm: qsp.data.compNm,
    email: qsp.data.email,
    deptNm: qsp.data.deptNm,
    authCd: qsp.data.authCd,
    storeLvl: qsp.data.storeLvl,
    statCd: qsp.data.statCd,
  };

  // 6. JWT 토큰 생성 + httpOnly 쿠키 설정
  const token = await signToken(user);
  const response = NextResponse.json({ data: user });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });

  return response;
}
