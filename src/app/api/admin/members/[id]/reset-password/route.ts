import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { logError } from "@/lib/log-error";
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
import { fetchQspUserDetail } from "@/lib/qsp-member";
import { memberIdParamSchema } from "@/lib/schemas/member";
import { userTpSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/members/:id/reset-password — 관리자 비밀번호 초기화
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인 — MEMBERS.update 매트릭스 기반
    //    (비밀번호 초기화는 대상 회원 리소스의 상태 변경이므로 update 로 분류)
    const authResult = await requireMenuPermission(request.headers, "ADM_MEMBER", "update");
    if (authResult instanceof NextResponse) return authResult;
    const { user: admin } = authResult;

    // 1-a. Rate limit: 관리자 계정 탈취 시 남용 방어
    // MF-2: X-Forwarded-For 는 스푸핑 가능하므로 primary 키를 admin.userId 로 고정.
    //       in-memory 저장소 한계상 멀티 인스턴스 환경에서는 인스턴스당 카운터가 분리되므로
    //       배포 환경(서버리스/멀티 pod)에서는 Redis 등 공유 저장소로 교체 필요.
    const HOUR_MS = 60 * 60 * 1000;
    if (!checkRateLimit(`admin-pw-reset:admin:${admin.userId}`, 20, HOUR_MS)) {
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

    // 1-b. 타겟 사용자 이차 캡: 동일 회원을 대상으로 한 리셋 반복 방지 (시간당 5건)
    //       여러 관리자 계정 탈취에 대비한 회원 단위 보호.
    if (!checkRateLimit(`admin-pw-reset:target:${rawId}`, 5, HOUR_MS)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }

    // 3. userTp 파라미터 검증 + 대상 회원 정보 조회 (이메일 획득)
    const userTpParseResult = userTpSchema.safeParse(request.nextUrl.searchParams.get("userTp"));
    if (!userTpParseResult.success) {
      return NextResponse.json(
        { error: "ユーザータイプが不正です" },
        { status: 400 },
      );
    }
    const userTp = userTpParseResult.data;

    const detailResult = await fetchQspUserDetail(rawId, userTp, "[POST /api/admin/members/:id/reset-password]");
    if (!detailResult.ok) {
      return NextResponse.json({ error: detailResult.error.error }, { status: detailResult.error.status });
    }
    const detail = detailResult.detail;

    // MF-2: 비활성 회원(탈퇴/삭제) 비밀번호 초기화 차단
    // 탈퇴한 이메일이 재활용된 경우 제3자가 리셋 링크를 수신하여 계정 탈취 가능.
    if (detail.statCd === null) {
      console.error("[POST /api/admin/members/:id/reset-password] 회원 statCd가 null — 데이터 이상:", rawId);
      return NextResponse.json(
        { error: "会員のステータス情報が不正です" },
        { status: 502 },
      );
    }
    if (detail.statCd !== "A") {
      console.warn(
        "[POST /api/admin/members/:id/reset-password] 비활성 회원 초기화 시도 차단 — statCd:",
        detail.statCd,
      );
      return NextResponse.json(
        { error: "アクティブな会員のみパスワード初期化が可能です" },
        { status: 400 },
      );
    }

    const memberEmail = detail.email;
    const memberUserTp = detail.userTp;
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

    // 5. 새 토큰 생성 (기존 토큰 무효화는 메일 발송 성공 후로 연기)
    // MF-1: DB에는 SHA-256 해시만 저장. 이메일/URL에는 원본 토큰을 전달한다.
    // MF-5: 기존 유효 토큰을 선제 무효화했다가 메일 발송 실패 시 롤백이 불완전해
    //       사용자가 이전에 받은 유효 링크도 모두 잃는 문제가 있었음.
    //       → 메일 발송 성공 후 invalidate 수행. 실패 경로에서는 신규 토큰만 제거.
    const rawToken = generateRawResetToken();
    const token = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

    try {
      await prisma.passwordResetToken.create({
        data: {
          userType: validatedUserTp,
          userId: memberEmail,
          loginId: rawId,
          token,
          expiresAt,
          createdBy: admin.userId,
        },
      });
    } catch (error: unknown) {
      console.error("[POST /api/admin/members/:id/reset-password] 토큰 생성 실패:", error);
      return NextResponse.json(
        { error: "パスワード初期化の処理に失敗しました" },
        { status: 500 },
      );
    }

    // 6. 비밀번호 변경 링크 메일 발송
    // HTTPS 검증: 운영환경에서 http로 링크가 발송되면 토큰이 평문으로 네트워크에 노출됨.
    // (password-reset/request 라우트와 동일 가드)
    if (process.env.NODE_ENV === "production" && !SITE_URL.startsWith("https://")) {
      console.error(
        "[POST /api/admin/members/:id/reset-password] SITE_URL이 https로 시작하지 않음:",
        SITE_URL,
      );
      // MF-5: 신규 토큰이 DB 에 적재된 상태 — 메일 미발송 + 토큰 잔류 시
      //       다음 요청의 rate limit 카운트에 영향 주지 않도록 즉시 롤백.
      //       기존 유효 토큰은 아직 무효화하지 않았으므로 사용자가 이전에 받은 링크는 그대로 유효.
      await prisma.passwordResetToken
        .deleteMany({ where: { token } })
        .catch((dbError: unknown) => {
          console.error(
            "[POST /api/admin/members/:id/reset-password] 토큰 롤백 실패 — orphan 토큰 잔류, tokenHashPrefix:",
            token.slice(0, 8),
            dbError,
          );
        });
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    // URL에는 원본 토큰을 사용 — 사용자가 링크를 열면 해싱 후 DB 조회
    const resetUrl = `${SITE_URL}/password-reset?token=${rawToken}`;

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
      // MF-5: 신규 토큰만 삭제하면 됨. 기존 유효 토큰은 아직 무효화하지 않았으므로
      //       사용자가 이전에 받은 링크는 그대로 유효하게 유지된다.
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

    // MF-5: 메일 발송 성공 후 기존 유효 토큰 무효화 (신규 토큰은 제외)
    // 실패해도 사용자 입장에서는 메일을 받은 상태이므로 치명적이지 않음 — WARN 로그로 남김.
    try {
      await prisma.passwordResetToken.updateMany({
        where: {
          userType: validatedUserTp,
          userId: memberEmail,
          used: false,
          token: { not: token },
        },
        data: { used: true },
      });
    } catch (invalidateError: unknown) {
      console.warn(
        "[POST /api/admin/members/:id/reset-password] 기존 토큰 무효화 실패 — 신규 링크는 정상 발송됨:",
        invalidateError,
      );
    }

    console.log("[POST /api/admin/members/:id/reset-password] 비밀번호 초기화 메일 발송 완료");

    return NextResponse.json({
      data: { message: "パスワード変更リンクをメールで送信しました。" },
    });
  } catch (error: unknown) {
    logError("POST /api/admin/members/:id/reset-password", error);
    return NextResponse.json(
      { error: "パスワード初期化処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
