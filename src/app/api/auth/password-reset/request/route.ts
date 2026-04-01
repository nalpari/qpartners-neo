import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetRequestSchema } from "@/lib/schemas/password-reset";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { sendMail } from "@/lib/mailer";
import {
  passwordResetMailHtml,
  PASSWORD_RESET_SUBJECT,
} from "@/lib/mail-templates/password-reset";
import { SITE_DEFAULTS, QSP_API } from "@/lib/config";

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

  const { userTp, email, loginId, sekoId } = result.data;

  // 2. QSP /user/detail 회원 존재 확인 (화면설계서 p.10)
  const params = new URLSearchParams({ accsSiteCd: "QPARTNERS", email, userTp });
  if (loginId) params.set("loginId", loginId);
  if (sekoId) params.set("sekoId", sekoId);

  let userExists = false;
  try {
    const qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (qspResponse.ok) {
      const qspBody = await qspResponse.json();
      const parsed = qspResponseSchema.safeParse(qspBody);
      userExists = parsed.success && parsed.data.result.resultCode === "S" && parsed.data.data != null;
    }
  } catch (error) {
    console.error("[POST /api/auth/password-reset/request] QSP 회원조회 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  if (!userExists) {
    return NextResponse.json(
      { error: "일치하는 회원 정보가 없습니다. 입력하신 정보를 다시 확인해 주세요." },
      { status: 404 },
    );
  }

  // 3. Rate limiting — 동일 이메일 시간당 3건 제한
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  let recentCount: number;
  try {
    recentCount = await prisma.passwordResetToken.count({
      where: {
        userId: email,
        createdAt: { gte: oneHourAgo },
      },
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/request] rate limit 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  if (recentCount >= 3) {
    return NextResponse.json({
      data: { message: "비밀번호 변경 링크가 이메일로 발송되었습니다." },
    });
  }

  // 4. 기존 미사용 토큰 무효화 + 새 토큰 생성 (트랜잭션)
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

  // 5. 비밀번호 변경 링크 메일 발송 (await하여 에러 로깅 보장, 이메일 존재 여부 노출 방지를 위해 동일 응답 유지)
  const siteUrl = process.env.SITE_URL ?? SITE_DEFAULTS.url;
  const resetUrl = `${siteUrl}/password-reset?token=${token}`;

  try {
    await sendMail({
      to: email,
      subject: PASSWORD_RESET_SUBJECT,
      html: passwordResetMailHtml({ resetUrl }),
    });
  } catch (error) {
    console.error(
      `[POST /api/auth/password-reset/request] 메일 발송 실패 — to=${email}`,
      error instanceof Error ? { message: error.message } : error,
    );
  }

  // 6. 성공 응답
  return NextResponse.json({
    data: { message: "비밀번호 변경 링크가 이메일로 발송되었습니다." },
  });
}
