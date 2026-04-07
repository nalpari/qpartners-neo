import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mailer";
import {
  generateRawResetToken,
  hashResetToken,
} from "@/lib/password-reset-token";
import {
  passwordResetMailHtml,
  PASSWORD_RESET_SUBJECT,
} from "@/lib/mail-templates/password-reset";
import {
  memberIdParamSchema,
  qspMemberDetailResponseSchema,
} from "@/lib/schemas/member";
import { userTpSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/members/:id/reset-password — 관리자 비밀번호 초기화
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;
    const { user: admin } = authResult;

    // 1-a. Rate limit: 관리자 계정 탈취 시 남용 방어 (시간당 20건)
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const rateLimitKey = ip ?? `admin:${admin.userId}`;
    if (!checkRateLimit(`admin-pw-reset:${rateLimitKey}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = memberIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. 대상 회원 정보 조회 (이메일 획득)
    const qspParams = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      userId: rawId,
    });

    let qspResponse: Response;
    try {
      qspResponse = await fetch(`${QSP_API.memberDetail}?${qspParams.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error: unknown) {
      console.error("[POST /api/admin/members/:id/reset-password] QSP 회원 조회 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/admin/members/:id/reset-password] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error: unknown) {
      console.error("[POST /api/admin/members/:id/reset-password] QSP 응답 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[POST /api/admin/members/:id/reset-password] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S" || !parsed.data.data) {
      return NextResponse.json(
        { error: "会員情報が見つかりません" },
        { status: 404 },
      );
    }

    // MF-2: 비활성 회원(탈퇴/삭제) 비밀번호 초기화 차단
    // 탈퇴한 이메일이 재활용된 경우 제3자가 리셋 링크를 수신하여 계정 탈취 가능.
    if (parsed.data.data.statCd !== "Y") {
      console.warn(
        "[POST /api/admin/members/:id/reset-password] 비활성 회원 초기화 시도 차단 — statCd:",
        parsed.data.data.statCd,
      );
      return NextResponse.json(
        { error: "アクティブな会員のみパスワード初期化が可能です" },
        { status: 400 },
      );
    }

    const memberEmail = parsed.data.data.email;
    const memberUserTp = parsed.data.data.userTp;
    if (!memberEmail) {
      console.warn("[POST /api/admin/members/:id/reset-password] 회원 이메일 없음");
      return NextResponse.json(
        { error: "会員のメールアドレスが登録されていません" },
        { status: 400 },
      );
    }

    // 4. userTp → DB enum 매핑 (Zod enum으로 안전 검증)
    const userTpResult = userTpSchema.safeParse(memberUserTp);
    if (!userTpResult.success) {
      console.error("[POST /api/admin/members/:id/reset-password] 알 수 없는 userTp:", memberUserTp);
      return NextResponse.json(
        { error: "会員情報に不整合があります" },
        { status: 500 },
      );
    }
    const validatedUserTp = userTpResult.data;

    // 5. 기존 미사용 토큰 무효화 + 새 토큰 생성 (트랜잭션)
    // MF-1: DB에는 SHA-256 해시만 저장. 이메일/URL에는 원본 토큰을 전달한다.
    const rawToken = generateRawResetToken();
    const token = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

    try {
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userType: validatedUserTp, userId: memberEmail, used: false },
          data: { used: true },
        }),
        prisma.passwordResetToken.create({
          data: {
            userType: validatedUserTp,
            userId: memberEmail,
            loginId: rawId,
            token,
            expiresAt,
            createdBy: admin.userId,
          },
        }),
      ]);
    } catch (error: unknown) {
      console.error("[POST /api/admin/members/:id/reset-password] 토큰 생성 실패:", error);
      return NextResponse.json(
        { error: "パスワード初期化の処理に失敗しました" },
        { status: 500 },
      );
    }

    // 6. 비밀번호 변경 링크 메일 발송
    const siteUrl = process.env.SITE_URL ?? SITE_DEFAULTS.url;
    // HTTPS 검증: 운영환경에서 http로 링크가 발송되면 토큰이 평문으로 네트워크에 노출됨.
    if (process.env.NODE_ENV === "production" && !siteUrl.startsWith("https://")) {
      console.error(
        "[POST /api/admin/members/:id/reset-password] SITE_URL이 https로 시작하지 않음:",
        siteUrl,
      );
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    // URL에는 원본 토큰을 사용 — 사용자가 링크를 열면 해싱 후 DB 조회
    const resetUrl = `${siteUrl}/password-reset?token=${rawToken}`;

    try {
      await sendMail({
        to: memberEmail,
        subject: PASSWORD_RESET_SUBJECT,
        html: passwordResetMailHtml({ resetUrl }),
      });
    } catch (error: unknown) {
      console.error(
        "[POST /api/admin/members/:id/reset-password] 메일 발송 실패:",
        error instanceof Error ? { message: error.message } : error,
      );
      // 토큰 삭제 (발송 실패 시 orphan 방지)
      try {
        await prisma.passwordResetToken.deleteMany({ where: { token } });
      } catch (dbError: unknown) {
        console.error("[POST /api/admin/members/:id/reset-password] CRITICAL: 토큰 롤백 실패 — 수동 확인 필요, tokenHashPrefix:", token.slice(0, 8), dbError);
        return NextResponse.json(
          { error: "メール送信に失敗し、初期化トークンの取消にも失敗しました。管理者に連絡してください。" },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "メールの送信に失敗しました" },
        { status: 500 },
      );
    }

    console.log("[POST /api/admin/members/:id/reset-password] 비밀번호 초기화 메일 발송 완료");

    return NextResponse.json({
      data: { message: "パスワード変更リンクをメールで送信しました。" },
    });
  } catch (error: unknown) {
    console.error("[POST /api/admin/members/:id/reset-password] 비밀번호 초기화 실패:", error);
    return NextResponse.json(
      { error: "パスワード初期化処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
