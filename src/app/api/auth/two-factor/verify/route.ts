import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { twoFactorVerifySchema } from "@/lib/schemas/two-factor";
import { verifyToken, signToken, COOKIE_NAME } from "@/lib/jwt";
import { timingSafeEqual } from "crypto";

import { QSP_API } from "@/lib/config";
import { hashOtp } from "@/lib/auth-utils";

const MAX_VERIFY_ATTEMPTS = 5;

// POST /api/auth/two-factor/verify — 2차 인증번호 검증
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

  const result = twoFactorVerifySchema.safeParse(body);
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

  const { userTp, userId, code } = result.data;

  // 2. JWT 검증
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 },
    );
  }

  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json(
      { error: "토큰이 만료되었거나 유효하지 않습니다" },
      { status: 401 },
    );
  }

  // JWT 사용자와 요청 사용자 일치 여부 검증
  if (user.userId !== userId || user.userTp !== userTp) {
    return NextResponse.json(
      { error: "요청 사용자 정보가 일치하지 않습니다" },
      { status: 403 },
    );
  }

  // 3. DB에서 최신 미검증 코드 조회
  let record;
  try {
    record = await prisma.twoFactorCode.findFirst({
      where: { userType: userTp, userId, verified: false },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[POST /api/auth/two-factor/verify] DB 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  if (!record) {
    return NextResponse.json(
      { error: "인증번호를 먼저 발송해 주세요." },
      { status: 401 },
    );
  }

  // 4. 만료시간 확인
  if (record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "입력시간이 초과되었습니다. 재전송 후, 다시 입력해주세요." },
      { status: 401 },
    );
  }

  // 5. 코드 일치 확인 (HMAC-SHA256 해시 비교, constant-time) + brute-force 방어
  const expected = Buffer.from(record.code, "hex");
  const actual = Buffer.from(hashOtp(code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    // 시도 횟수 원자적 증가 + 갱신된 값으로 판단 (동시성 안전)
    let updated;
    try {
      updated = await prisma.twoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
    } catch (error) {
      console.error("[POST /api/auth/two-factor/verify] attempts 증가 실패:", error);
      return NextResponse.json(
        { error: "서버 오류가 발생했습니다" },
        { status: 500 },
      );
    }

    if (updated.attempts >= MAX_VERIFY_ATTEMPTS) {
      // 최대 시도 초과 → 코드 무효화
      try {
        await prisma.twoFactorCode.update({
          where: { id: record.id },
          data: { verified: true },
        });
      } catch (error) {
        console.error("[POST /api/auth/two-factor/verify] 코드 무효화 실패 (보안 주의):", error);
      }
      return NextResponse.json(
        { error: "인증 시도 횟수를 초과했습니다. 인증번호를 재발송해 주세요." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "인증번호가 일치하지 않습니다." },
      { status: 401 },
    );
  }

  // 6. 성공 — DB 업데이트
  try {
    await prisma.twoFactorCode.update({
      where: { id: record.id },
      data: { verified: true, verifiedAt: new Date() },
    });
  } catch (error) {
    console.error("[POST /api/auth/two-factor/verify] DB 업데이트 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 7. QSP 2차인증 일시 갱신 (비동기 — 실패해도 사용자 흐름 차단하지 않음)
  fetch(QSP_API.updateSecAuthDt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      userTp,
      loginId: userId,
      accsSiteCd: "QPARTNERS",
    }),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(
          "[POST /api/auth/two-factor/verify] QSP updateSecAuthDt HTTP 오류:",
          res.status,
        );
      }
    })
    .catch((error) => {
      console.error(
        "[POST /api/auth/two-factor/verify] QSP updateSecAuthDt 네트워크 실패:",
        error instanceof Error ? { message: error.message } : error,
      );
    });

  // 8. JWT 재발행 (twoFactorVerified: true)
  let newToken: string;
  try {
    newToken = await signToken({ ...user, twoFactorVerified: true });
  } catch (error) {
    console.error("[POST /api/auth/two-factor/verify] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "인증 처리 중 서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ data: { verified: true } });

  response.cookies.set(COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });

  return response;
}
