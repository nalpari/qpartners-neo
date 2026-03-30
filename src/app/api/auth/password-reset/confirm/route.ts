import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/schemas/password-reset";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import type { LoginUser } from "@/lib/schemas/auth";

// POST /api/auth/password-reset/confirm — 비밀번호 변경 + 자동 로그인
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

  const result = passwordResetConfirmSchema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return NextResponse.json(
      { error: "Validation failed", fields },
      { status: 400 },
    );
  }

  const { token, newPassword } = result.data;

  // 2. 토큰 재검증
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "유효하지 않거나 만료된 링크입니다." },
      { status: 400 },
    );
  }

  // 3. QSP 유저정보 조회 (이메일 → loginId 획득)
  const detailParams = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email: resetToken.userId,
    userTp: resetToken.userType,
  });

  let loginId = resetToken.userId; // 기본값: email
  try {
    const detailRes = await fetch(
      `${QSP_API.userDetail}?${detailParams.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) },
    );
    if (detailRes.ok) {
      const detailBody = await detailRes.json();
      if (detailBody?.data?.userId) {
        loginId = detailBody.data.userId;
      }
    }
  } catch {
    // 조회 실패 시 email을 loginId로 사용 (일반회원은 email=loginId인 경우)
  }

  // 4. QSP 비밀번호 변경 API 호출 (chgType=I)
  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_API.passwordChange, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        accsSiteCd: "QPARTNERS",
        userTp: resetToken.userType,
        loginId,
        chgType: "I",
        email: resetToken.userId,
        chgPwd: newPassword,
      }),
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 서버 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch {
    return NextResponse.json(
      { error: "외부 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success || parsed.data.result.resultCode !== "S") {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비밀번호 변경 실패:", qspBody);
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다" },
      { status: 500 },
    );
  }

  // 4. 토큰 사용 완료 처리
  await prisma.passwordResetToken.update({
    where: { token },
    data: { used: true },
  });

  // 5. 자동 로그인 — JWT 발행 + 쿠키 설정
  //    loginId: QSP에서 조회한 실제 userId 사용 (ADMIN/DEALER는 email과 다를 수 있음)
  const user: LoginUser = {
    userId: loginId,
    userNm: null,
    userTp: resetToken.userType,
    compCd: null,
    compNm: null,
    email: resetToken.userId,
    deptNm: null,
    authCd: null,
    storeLvl: null,
    statCd: null,
  };

  let jwtToken: string;
  try {
    jwtToken = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "인증 처리 중 서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    data: {
      message: "저장되었습니다.",
      user,
      requireTwoFactor: false, // 비밀번호 초기화 후 로그인은 2차 인증 Skip (p.14 스펙)
    },
  });

  response.cookies.set(COOKIE_NAME, jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
