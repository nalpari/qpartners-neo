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
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/auth/password-reset/request — 비밀번호 초기화 요청 (메일 발송)
export async function POST(request: NextRequest) {
 try {
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

  // 2-a. IP 기반 rate limiting — 열거 공격 방어 (토큰 미생성 이메일도 제한)
  // [전제] 배포 환경의 리버스 프록시(Nginx/ALB)가 클라이언트 x-forwarded-for를 덮어씀.
  //        프록시 없이 직접 노출 시 클라이언트가 헤더를 스푸핑할 수 있으므로
  //        이메일 기반 rate limit(2-b)이 최종 방어선 역할을 함.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  // IP 없으면 email 기반 fallback key 사용 — 공용 버킷으로 전체 차단되는 문제 방지
  const ipKey = ip ?? `account:${email}`;
  if (!checkRateLimit(`pw-reset:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
      { status: 429 },
    );
  }
  if (!ip) {
    console.warn("[POST /api/auth/password-reset/request] IP 헤더 없음 — email 기반 rate limit 적용");
  }

  // 2-b. Rate limiting — 동일 이메일 시간당 3건 제한 (토큰 생성 기준)
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
      { error: "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。" },
      { status: 500 },
    );
  }

  if (recentCount >= 3) {
    return NextResponse.json(
      { error: "しばらく経ってから再度お試しください。（1時間以内の送信回数上限）" },
      { status: 429 },
    );
  }

  // 3. QSP /user/detail 회원 존재 확인 (password-reset.design.md p.10)
  const params = new URLSearchParams({ accsSiteCd: "QPARTNERS", email, userTp });
  if (loginId) params.set("loginId", loginId);
  if (sekoId) params.set("sekoId", sekoId);

  let userExists = false;
  try {
    const qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (!qspResponse.ok) {
      console.error("[POST /api/auth/password-reset/request] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました。" },
        { status: 502 },
      );
    }

    const qspBody = await qspResponse.json().catch((parseError: unknown) => {
      console.error("[POST /api/auth/password-reset/request] QSP 응답 JSON 파싱 실패:", parseError);
      return null;
    });
    if (qspBody === null) {
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません。" },
        { status: 502 },
      );
    }
    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[POST /api/auth/password-reset/request] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません。" },
        { status: 502 },
      );
    }
    userExists = parsed.data.result.resultCode === "S" && parsed.data.data != null;
  } catch (error) {
    console.error("[POST /api/auth/password-reset/request] QSP 회원조회 실패:", error);
    return NextResponse.json(
      { error: "外部サーバーに接続できません。" },
      { status: 502 },
    );
  }

  // 유저 미존재 시에도 동일 성공 응답 반환 — 이메일 열거 공격 방지
  if (!userExists) {
    console.info(`[POST /api/auth/password-reset/request] 회원 미존재 — userTp: ${userTp}`);
    return NextResponse.json({
      data: { message: "パスワード変更リンクをメールで送信しました。" },
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
          loginId: loginId ?? null,
          token,
          expiresAt,
        },
      }),
    ]);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/request] 토큰 생성 실패:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 },
    );
  }

  // 5. 비밀번호 변경 링크 메일 발송
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
      "[POST /api/auth/password-reset/request] 메일 발송 실패",
      error instanceof Error ? { message: error.message } : error,
    );
    // 토큰 삭제 (rate limit 미소모 — count 쿼리에서 제외)
    await prisma.passwordResetToken.deleteMany({
      where: { token },
    }).catch((dbError: unknown) => {
      console.error("[POST /api/auth/password-reset/request] 토큰 롤백 실패 — orphan 토큰 잔류, tokenPrefix:", token.slice(0, 8), dbError);
    });
    return NextResponse.json(
      { error: "メールの送信に失敗しました。しばらくしてからもう一度お試しください。" },
      { status: 500 },
    );
  }

  // 6. 성공 응답
  return NextResponse.json({
    data: { message: "パスワード変更リンクをメールで送信しました。" },
  });
 } catch (error) {
    console.error("[POST /api/auth/password-reset/request]", error);
    return NextResponse.json(
      { error: "パスワード初期化処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
