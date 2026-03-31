import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  loginRequestSchema,
  qspLoginResponseSchema,
} from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";

// POST /api/auth/login — QSP 로그인 프록시
export async function POST(request: NextRequest) {

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

  // 2. QSP API 호출
  const { loginId, pwd, userTp } = result.data;

  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // M4: 10초 타임아웃
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        loginId,
        pwd,
        userTp,
        accsSiteCd: "QPARTNERS",
        // I5: QSP API 규격상 로그인 요청 시 actLog="LOGOUT" 전송 (QSP 인터페이스 사양서 참조)
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

  // I6: QSP HTTP 비정상 응답 처리
  if (!qspResponse.ok) {
    console.error("[POST /api/auth/login] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 인증 서버 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch {
    console.error("[POST /api/auth/login] QSP 응답 JSON 파싱 실패");
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

  // 5. 2차 인증 필요 여부 판별
  //    - secAuthYn === "Y" + 비밀번호 초기화 후 로그인이 아닌 경우 → 필요
  //    - pwdInitYn === "Y" (비밀번호 초기화 직후) → 불필요 (p.14 스펙)
  const requireTwoFactor =
    qsp.data.secAuthYn === "Y" && qsp.data.pwdInitYn !== "Y";

  // 6. 클라이언트에 전달할 사용자 정보 추출
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
    // fail-closed: 2FA 필요 시 false, 불필요 시 true 명시 설정
    twoFactorVerified: !requireTwoFactor,
  };

  // C2: JWT 생성 실패 처리
  let token: string;
  try {
    token = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/login] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "인증 처리 중 서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 7. httpOnly 쿠키 설정
  const response = NextResponse.json({
    data: { ...user, requireTwoFactor },
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });

  return response;
}
