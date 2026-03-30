import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { twoFactorSendSchema } from "@/lib/schemas/two-factor";
import { sendMail } from "@/lib/mailer";
import {
  twoFactorMailHtml,
  TWO_FACTOR_SUBJECT,
} from "@/lib/mail-templates/two-factor";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { randomInt } from "crypto";

/** 6자리 인증번호 생성 (100000~999999, 암호학적 안전 난수) */
function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

// POST /api/auth/two-factor/resend — 2차 인증번호 재전송
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

  const result = twoFactorSendSchema.safeParse(body);
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

  const { userTp, userId } = result.data;

  // 2. JWT에서 사용자 이메일 추출 + 본인 확인
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

  if (!user.email) {
    return NextResponse.json(
      { error: "이메일 정보가 없어 인증번호를 발송할 수 없습니다" },
      { status: 400 },
    );
  }

  // 3. 기존 미사용 코드 무효화 + 새 코드 생성
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분

  try {
    await prisma.$transaction([
      prisma.twoFactorCode.updateMany({
        where: { userType: userTp, userId, verified: false },
        data: { verified: true },
      }),
      prisma.twoFactorCode.create({
        data: {
          userType: userTp,
          userId,
          code,
          expiresAt,
          createdBy: userId,
        },
      }),
    ]);
  } catch (error) {
    console.error("[POST /api/auth/two-factor/resend] DB 처리 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 4. 메일 재발송 (비동기)
  sendMail({
    to: user.email,
    subject: TWO_FACTOR_SUBJECT,
    html: twoFactorMailHtml({ code }),
  }).catch((error) => {
    console.error(
      `[POST /api/auth/two-factor/resend] 메일 발송 실패 — to=${user.email}`,
      error instanceof Error ? { message: error.message } : error,
    );
  });

  return NextResponse.json({
    data: {
      message: "인증번호가 재전송되었습니다.",
      expiresIn: 600,
    },
  });
}
