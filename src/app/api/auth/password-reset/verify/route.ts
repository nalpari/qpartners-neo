import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetVerifySchema } from "@/lib/schemas/password-reset";
import { hashResetToken } from "@/lib/password-reset-token";

// POST /api/auth/password-reset/verify — 토큰 검증
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

  const result = passwordResetVerifySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed" },
      { status: 400 },
    );
  }

  const { token: rawToken } = result.data;
  // DB에는 SHA-256 해시가 저장되어 있음 — 입력 토큰을 해싱 후 조회
  const tokenHash = hashResetToken(rawToken);

  // 2. DB에서 토큰 조회
  let resetToken;
  try {
    resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/verify] DB 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 3. 유효성 검증
  if (!resetToken) {
    return NextResponse.json(
      { error: "유효하지 않거나 만료된 링크입니다." },
      { status: 400 },
    );
  }

  if (resetToken.used) {
    return NextResponse.json(
      { error: "이미 사용된 링크입니다." },
      { status: 400 },
    );
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "유효하지 않거나 만료된 링크입니다." },
      { status: 400 },
    );
  }

  // 4. 유효한 토큰 — popup 의 read-only 표시용으로 email 함께 반환.
  //    토큰은 메일 수신 본인만 보유한다는 전제 + 1시간 TTL/사용 후 invalidate 로 노출 위험 제한적.
  //    user_id 컬럼이 사실상 email(GENERAL/SEKO) 또는 email 형식 식별자 — 그대로 노출.
  return NextResponse.json({
    data: {
      valid: true,
      userType: resetToken.userType,
      email: resetToken.userId,
    },
  });
}
