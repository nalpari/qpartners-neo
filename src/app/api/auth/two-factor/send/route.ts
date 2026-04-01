import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { twoFactorSendSchema } from "@/lib/schemas/two-factor";
import { sendMail } from "@/lib/mailer";
import type { SendMailResult } from "@/lib/mailer";
import {
  twoFactorMailHtml,
  TWO_FACTOR_SUBJECT,
} from "@/lib/mail-templates/two-factor";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { generateTwoFactorCode, hashOtp } from "@/lib/auth-utils";

// POST /api/auth/two-factor/send — 2차 인증번호 발송
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

  // 2-1. Rate limiting — 동일 사용자 10분 내 3건 제한
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  let recentCount: number;
  try {
    recentCount = await prisma.twoFactorCode.count({
      where: {
        userType: userTp,
        userId,
        createdAt: { gte: tenMinutesAgo },
      },
    });
  } catch (error) {
    console.error("[POST /api/auth/two-factor/send] rate limit 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  if (recentCount >= 3) {
    return NextResponse.json(
      { error: "인증번호 발송 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  // 3. 기존 미사용 코드 무효화 + 새 코드 생성
  const code = generateTwoFactorCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분

  try {
    await prisma.$transaction([
      // 기존 미검증 코드 무효화 (verified=true로 설정하여 재사용 방지)
      // NOTE: verified=true는 "검증 완료"와 "무효화" 두 의미를 공유함
      //   - verifiedAt !== null → 실제 검증 완료
      //   - verifiedAt === null && verified === true → 무효화 (재발송/시도초과)
      prisma.twoFactorCode.updateMany({
        where: { userType: userTp, userId, verified: false },
        data: { verified: true },
      }),
      // 새 코드 생성
      prisma.twoFactorCode.create({
        data: {
          userType: userTp,
          userId,
          code: hashOtp(code),
          expiresAt,
          createdBy: userId,
        },
      }),
    ]);
  } catch (error) {
    console.error("[POST /api/auth/two-factor/send] DB 처리 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  // 4. 메일 발송
  let mailResult: SendMailResult;
  try {
    mailResult = await sendMail({
      to: user.email,
      subject: TWO_FACTOR_SUBJECT,
      html: twoFactorMailHtml({ code }),
    });
  } catch (error) {
    console.error(
      `[POST /api/auth/two-factor/send] 메일 발송 실패`,
      error instanceof Error ? { message: error.message, stack: error.stack } : error,
    );
    // 메일 미발송 시 해당 사용자의 모든 미검증 코드 무효화 (rate limit 소모 방지)
    await prisma.twoFactorCode.updateMany({
      where: { userType: userTp, userId, verified: false },
      data: { verified: true },
    }).catch((dbError) => {
      console.error("[POST /api/auth/two-factor/send] 코드 무효화 실패:", dbError);
    });
    return NextResponse.json(
      { error: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      message: "인증번호가 발송되었습니다.",
      expiresIn: 600,
      ...(mailResult.ethereal && mailResult.previewUrl
        ? { _dev_previewUrl: mailResult.previewUrl }
        : {}),
    },
  });
}
