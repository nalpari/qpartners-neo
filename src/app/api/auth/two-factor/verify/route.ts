import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { twoFactorVerifySchema } from "@/lib/schemas/two-factor";
import { verifyToken, signToken, COOKIE_NAME, sessionInvalidResponse } from "@/lib/jwt";
import { timingSafeEqual } from "crypto";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { hashOtp } from "@/lib/auth-utils";
import { sekoSave2faVerified, formatSekoDateTime } from "@/lib/seko-connector";
import { checkSekoIdValid } from "@/lib/seko-id-gate";
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

  // 7. 2차인증 일시 갱신 — await 로 결과 확정 후 진행 (fail-open).
  //    fire-and-forget 으로 두면 Next.js 런타임이 응답 반환 직후 이벤트 루프를 종료해
  //    fetch 자체가 중단될 가능성이 있고, secAuthDt 가 갱신 안 되면 다음 로그인 만료
  //    판정이 또 트리거되어 사용자가 매 세션 2FA 를 다시 받게 된다.
  //    실패 정책: 사용자 흐름은 통과시키되(같은 세션은 DB verified=true 로 검증 증거 보유)
  //    운영 로그로 명시 알람 — 다음 세션은 자연스러운 재인증으로 폴백.
  //    단 SEKO 401(Bearer 만료)만은 fail-open 대상이 아니다 — 아래 분기 주석 참조.
  //
  //    인증 소스별 대상 API 가 다르다 — QSP 는 updateSecAuthDt, 시공점은 AS-IS Connector
  //    No.9 save2faVerified (QSP 미경유). 실패 처리 정책은 양쪽 동일하다.
  let secAuthUpdateOk = false;

  if (userTp === "SEKO") {
    // 시공점 — Bearer 는 로그인 시 JWT 에 담아둔 sekoToken 을 쓴다.
    // loginId 는 email(시공점은 loginId = email), userId 는 Connector 내부 ID 로 둘 다 필수다.
    const sekoLoginId = user.email;
    if (!user.sekoToken || !sekoLoginId) {
      console.error(
        "[POST /api/auth/two-factor/verify][SEKO] 세션에 sekoToken/loginId 없음 — 2차인증 일시 저장 생략",
        { userId: maskEmail(userId), hasToken: !!user.sekoToken, hasLoginId: !!sekoLoginId },
      );
    } else {
      try {
        const saveResult = await sekoSave2faVerified(
          userId,
          sekoLoginId,
          formatSekoDateTime(new Date()),
          user.sekoToken,
          "[POST /api/auth/two-factor/verify][SEKO]",
        );
        secAuthUpdateOk = saveResult.ok;
        if (!saveResult.ok) {
          console.error(
            "[POST /api/auth/two-factor/verify][SEKO] save2faVerified 실패 — status:",
            saveResult.error.status,
          );
          // 401(AUTHENTICATION_ERROR = Bearer 만료)은 secAuthDt 기록 실패와 성격이 다르다.
          // JWT 에 담긴 sekoToken 이 죽었다는 뜻이라, 그대로 통과시키면 로컬 JWT 는 유효해
          // middleware 가 지나보내고 후속 SEKO API 만 반복 401 이 되어 세션이 고착된다.
          // 다른 Connector 호출부(password-init·mypage/password-change·mypage/profile)와 동일하게
          // 쿠키를 만료시켜 재로그인으로 새 Bearer 를 받게 한다. 이번 검증은 DB 에 verified 로
          // 남아 있고, secAuthDt 가 미갱신이라 재로그인 시 2FA 를 다시 받는 것이 정상 흐름이다.
          // 문구는 다른 SEKO 세션 무효 경로와 동일하게 고정한다. 커넥터 원문
          // ("2段階認証情報の保存に失敗しました")을 그대로 내보내면 2FA 팝업의 메시지 매핑에
          // 걸리지 않아 "しばらくしてからお試しください"(재시도 안내)로 렌더되는데, 이 시점엔
          // 쿠키가 이미 삭제돼 재시도가 반드시 실패한다 - 사용자가 팝업에 갇힌다.
          if (saveResult.error.status === 401) {
            return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
          }
        }
      } catch (error) {
        // ConfigError(SEKO_CONNECTOR_BASE_URL 미설정 등) 포함 — fail-open 정책상 여기서 흡수한다.
        console.error(
          "[POST /api/auth/two-factor/verify][SEKO] save2faVerified 호출 실패:",
          error instanceof Error ? { message: error.message } : error,
        );
      }
    }
  } else {
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
      secAuthUpdateOk = qspUpdateRes.ok;
      if (!secAuthUpdateOk) {
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
  }

  if (!secAuthUpdateOk) {
    // 운영 모니터링용 — 다음 로그인에서 동일 사용자가 재인증 요구될 가능성 알람.
    console.warn(
      "[POST /api/auth/two-factor/verify] secAuthDt 갱신 실패 — 다음 로그인 재인증 가능성",
      { userId: maskEmail(userId), userType: userTp },
    );
  }

  // 7-2. 시공ID 유효기간 검사 — 로그인(SEKO 분기)이 `pwdInitYn="Y"` 계정에 대해 **유예**한
  //      게이트의 두 번째 회수 지점이다. 아래 JWT 재발행이 `twoFactorVerified:true` 로 세션을
  //      완전한 상태로 승격시키므로, 초기화 흐름을 거치지 않고 2FA 만 통과해 풀세션을 받는
  //      경로가 여기다 — `password-init` 만 막으면 이쪽이 그대로 열려 있다.
  //
  //      기존 세션의 JWT 재발급이라는 점에서 `mypage/profile` 과 같은 부류로 보이지만, 이 라우트는
  //      middleware 의 2FA 제한(`twoFactorVerified === false`)을 해제하는 유일한 지점이라 성격이
  //      다르다. 승격 = 세션 신규 발급과 동급으로 다룬다.
  if (userTp === "SEKO") {
    const sekoGateLoginId = user.email;
    if (!user.sekoToken || !sekoGateLoginId) {
      // 검사 자체가 불가능한 세션이다. 유효기간을 확인하지 못한 채 승격시키면 게이트가 조용히
      // 무력화되므로 fail-closed 로 재로그인을 유도한다 — 이 상태는 후속 SEKO API 도 전부 401 이라
      // 세션을 살려둘 이유가 없다(위 save2faVerified 401 분기와 같은 처리).
      console.error(
        "[POST /api/auth/two-factor/verify][SEKO] 세션에 sekoToken/loginId 없음 — 시공ID 검사 불가, 승격 차단",
        { userId: maskEmail(userId), hasToken: !!user.sekoToken, hasLoginId: !!sekoGateLoginId },
      );
      return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
    }

    const sekoIdGate = await checkSekoIdValid(
      sekoGateLoginId,
      user.sekoToken,
      "[POST /api/auth/two-factor/verify][SEKO]",
    );
    if (!sekoIdGate.valid) {
      return NextResponse.json(
        { error: sekoIdGate.message },
        { status: sekoIdGate.status },
      );
    }
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
    // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다. 위 시공ID 게이트가
    // 이를 흡수하지 않고 전파하므로(fail-closed) 여기서 구분해야 한다 — 일반 500 에 섞이면
    // 운영자가 env 누락을 코드 버그·DB 장애와 구분할 수 없다
    // (.claude/rules/api.md "어떤 환경변수가 누락됐는지 에러 메시지에 명시").
    // login·password-init 라우트와 동일한 처리다.
    if (error instanceof ConfigError) {
      console.error(
        "[POST /api/auth/two-factor/verify] 설정 에러:",
        error.name,
        "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요",
      );
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    console.error("[POST /api/auth/two-factor/verify]", error);
    return NextResponse.json(
      { error: "認証処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
