import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetRequestSchema } from "@/lib/schemas/password-reset";
import { sendMail } from "@/lib/mailer";
import {
  passwordResetMailHtml,
  PASSWORD_RESET_SUBJECT,
} from "@/lib/mail-templates/password-reset";
import { SITE_DEFAULTS } from "@/lib/config";

// POST /api/auth/password-reset/request — 비밀번호 초기화 요청 (메일 발송)
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

  const result = passwordResetRequestSchema.safeParse(body);
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

  const { userTp, email } = result.data;

  // 2. Rate limiting — 동일 이메일 시간당 3건 제한 (W2)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.passwordResetToken.count({
    where: {
      userId: email,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentCount >= 3) {
    // 이메일 존재 여부 노출 방지를 위해 동일 성공 응답 반환
    return NextResponse.json({
      data: { message: "비밀번호 변경 링크가 이메일로 발송되었습니다." },
    });
  }

  // 3. 기존 미사용 토큰 무효화 + 새 토큰 생성 (트랜잭션)
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

  try {
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: email, used: false },
        data: { used: true },
      }),
      prisma.passwordResetToken.create({
        data: {
          userType: userTp,
          userId: email,
          token,
          expiresAt,
        },
      }),
    ]);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/request] 토큰 생성 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 4. 비밀번호 변경 링크 메일 발송 (비동기 — 메일 실패해도 성공 응답)
  const siteUrl = process.env.SITE_URL ?? SITE_DEFAULTS.url;
  const resetUrl = `${siteUrl}/password-reset?token=${token}`;

  sendMail({
    to: email,
    subject: PASSWORD_RESET_SUBJECT,
    html: passwordResetMailHtml({ resetUrl }),
  }).catch((error) => {
    console.error(
      `[POST /api/auth/password-reset/request] 메일 발송 실패 — to=${email}`,
      error instanceof Error ? { message: error.message } : error,
    );
  });

  // 5. 항상 동일 응답 (이메일 존재 여부 노출 방지)
  return NextResponse.json({
    data: { message: "비밀번호 변경 링크가 이메일로 발송되었습니다." },
  });
}
