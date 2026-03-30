import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetVerifySchema } from "@/lib/schemas/password-reset";

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

  const { token } = result.data;

  // 2. DB에서 토큰 조회
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

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

  // 4. 유효한 토큰 (이메일 노출 방지 — userType만 반환)
  return NextResponse.json({
    data: {
      valid: true,
      userType: resetToken.userType,
    },
  });
}
