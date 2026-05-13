import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { twoFactorVerifySchema } from "@/lib/schemas/two-factor";
import { verifyToken, signToken, COOKIE_NAME } from "@/lib/jwt";
import { timingSafeEqual } from "crypto";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { hashOtp } from "@/lib/auth-utils";
import { sendLoginNotification } from "@/lib/notification-mail/login-mail";
import { extractClientIp } from "@/lib/notification-mail/utils";

const MAX_VERIFY_ATTEMPTS = 5;

// POST /api/auth/two-factor/verify — 2차 인증번호 검증
export async function POST(request: NextRequest) {
 try {
  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[POST /api/auth/two-factor/verify] Request body 파싱 실패:", error);
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
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json(
      { error: "トークンが期限切れか無効です" },
      { status: 401 },
    );
  }

  // JWT 사용자와 요청 사용자 일치 여부 검증
  if (user.userId !== userId || user.userTp !== userTp) {
    return NextResponse.json(
      { error: "リクエストユーザー情報が一致しません" },
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
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  if (!record) {
    return NextResponse.json(
      { error: "認証番号を先に送信してください。", code: "NOT_SENT" },
      { status: 401 },
    );
  }

  // 4. 만료시간 확인
  if (record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "入力時間を超過しました。再送信後、もう一度入力してください。", code: "EXPIRED" },
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
        { error: "サーバーエラーが発生しました" },
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
        { error: "認証の試行回数を超過しました。認証番号を再送信してください。", code: "MAX_ATTEMPTS" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "認証番号が一致しません。", code: "MISMATCH" },
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
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  // 7. QSP 2차인증 일시 갱신 — await 로 결과 확정 후 진행 (fail-open).
  //    fire-and-forget 으로 두면 Next.js 런타임이 응답 반환 직후 이벤트 루프를 종료해
  //    fetch 자체가 중단될 가능성이 있고, secAuthDt 가 갱신 안 되면 다음 로그인 만료
  //    판정이 또 트리거되어 사용자가 매 세션 2FA 를 다시 받게 된다.
  //    실패 정책: 사용자 흐름은 통과시키되(같은 세션은 DB verified=true 로 검증 증거 보유)
  //    운영 로그로 명시 알람 — 다음 세션은 자연스러운 재인증으로 폴백.
  let qspUpdateOk = false;
  try {
    const qspUpdateRes = await fetchWithLog(
      QSP_API.updateSecAuthDt,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          userTp,
          loginId: userId,
          accsSiteCd: "QPARTNERS",
        }),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "updateSecAuthDt",
        callerRoute: "[POST /api/auth/two-factor/verify]",
        userId: maskEmail(userId),
        userType: userTp,
      },
    );
    qspUpdateOk = qspUpdateRes.ok;
    if (!qspUpdateOk) {
      console.error(
        "[POST /api/auth/two-factor/verify] QSP updateSecAuthDt HTTP 오류:",
        qspUpdateRes.status,
      );
    }
  } catch (error) {
    console.error(
      "[POST /api/auth/two-factor/verify] QSP updateSecAuthDt 네트워크 실패:",
      error instanceof Error ? { message: error.message } : error,
    );
  }
  if (!qspUpdateOk) {
    // 운영 모니터링용 — 다음 로그인에서 동일 사용자가 재인증 요구될 가능성 알람.
    console.warn(
      "[POST /api/auth/two-factor/verify] secAuthDt 갱신 실패 — 다음 로그인 재인증 가능성",
      { userId: maskEmail(userId), userType: userTp },
    );
  }

  // 8. JWT 재발행 (twoFactorVerified: true)
  let newToken: string;
  try {
    newToken = await signToken({ ...user, twoFactorVerified: true });
  } catch (error) {
    console.error("[POST /api/auth/two-factor/verify] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "認証処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  // 9. 로그인 알림 메일 발송 (Redmine #2214 — 2FA 필수 사용자는 검증 성공 시점에 발송).
  //    조건: user.loginNotiYn === "Y" && user.email
  //    - login route 에서 2FA 필요 사용자는 발송 지연되었고, 본 시점이 "로그인 완료" 의 정확한 시점.
  //    - JWT 페이로드(user)에 loginNotiYn 포함하여 별도 QSP userDetail 재호출 회피.
  //    - fire-and-forget — login route 와 동일 정책. 메일 실패가 인증 흐름을 막지 않음.
  if (user.loginNotiYn === "Y" && user.email) {
    void sendLoginNotification({
      to: user.email,
      userNm: user.userNm,
      loginAt: new Date(),
      clientIp: extractClientIp(request),
      callerRoute: "[POST /api/auth/two-factor/verify]",
    }).catch((error: unknown) => {
      console.warn(
        "[POST /api/auth/two-factor/verify] 로그인 알림 메일 발송 처리 중 예외:",
        error,
      );
    });
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
 } catch (error) {
    console.error("[POST /api/auth/two-factor/verify]", error);
    return NextResponse.json(
      { error: "認証処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
