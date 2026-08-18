import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/schemas/password-reset";
import { hashResetToken } from "@/lib/password-reset-token";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import type { LoginUser } from "@/lib/schemas/auth";
import { resolveAuthRole } from "@/lib/auth";
import { userTpValues } from "@/lib/schemas/common";
import { sekoLogin, sekoResetPwd } from "@/lib/seko-connector";
import { checkRoleActive, resolveGateRoleCode } from "@/lib/role-active-gate";
import { checkRateLimit } from "@/lib/rate-limit";

/** QSP userDetail 응답에서 사용하는 필드만 검증 */
const qspUserDetailSchema = z.object({
  data: z.object({
    userId: z.string(),
    userNm: z.string().nullable().optional(),
    compCd: z.string().nullable().optional(),
    compNm: z.string().nullable().optional(),
    compTelNo: z.string().nullable().optional(),
    deptNm: z.string().nullable().optional(),
    authCd: z.string().nullable().optional(),
    storeLvl: z.string().nullable().optional(),
    statCd: z.string().nullable().optional(),
  }).nullable(),
});

/**
 * 토큰 롤백 헬퍼 — QSP 실패 시 토큰을 재사용 가능하게 복원.
 * 멱등 — 이미 미사용 상태면 0건 업데이트 후 true 반환.
 * @returns true면 롤백 성공 (재시도 가능), false면 롤백 실패 (새 링크 필요)
 */
async function rollbackToken(token: string): Promise<boolean> {
  try {
    await prisma.passwordResetToken.updateMany({
      where: { token, used: true },
      data: { used: false },
    });
    return true;
  } catch (err) {
    console.error("[password-reset/confirm] 토큰 롤백 실패:", err);
    return false;
  }
}

/** 토큰 롤백 + 에러 응답 생성 헬퍼 — 롤백 성공 시 재시도 안내, 실패 시 새 링크 안내 */
async function rollbackAndRespond(
  token: string,
  retryMsg: string,
  newLinkMsg: string,
  status: number,
): Promise<NextResponse> {
  const rolled = await rollbackToken(token);
  return NextResponse.json(
    { error: rolled ? retryMsg : newLinkMsg },
    { status },
  );
}

// POST /api/auth/password-reset/confirm — 비밀번호 변경 + 자동 로그인
export async function POST(request: NextRequest) {
 try {
  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[POST /api/auth/password-reset/confirm] Request body 파싱 실패:", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = passwordResetConfirmSchema.safeParse(body);
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

  const { token: rawToken, newPassword } = result.data;
  // DB에는 SHA-256 해시가 저장되어 있음 — 입력 토큰을 해싱 후 조회
  const token = hashResetToken(rawToken);

  // 1-a. Rate limit — confirm 은 QSP 비밀번호 변경 API 를 호출하므로 무제한 시 외부 API 부하 유발.
  //       verify 와 동일 패턴(IP 우선, 부재 시 token 해시 prefix) 으로 적용.
  //       [전제] 배포 환경의 리버스 프록시(Nginx/ALB) 가 클라이언트 x-forwarded-for 를 덮어씀.
  //       [보안] rawToken 원문 prefix 대신 hashResetToken 결과 prefix 를 사용 — 메모리 덤프/로그
  //       유출 시 rate limit 키에서 원본 토큰 일부가 역추출되는 채널 차단.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const tokenHashPrefix = token.slice(0, 16);
  const ipKey = ip ?? `token:${tokenHashPrefix}`;
  if (!checkRateLimit(`pw-confirm:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
      { status: 429 },
    );
  }
  if (!ip) {
    console.warn("[POST /api/auth/password-reset/confirm] IP 헤더 없음 — token hash prefix 기반 rate limit 적용");
  }

  // 2. 토큰 재검증
  let resetToken;
  try {
    resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] DB 조회 실패:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "無効または期限切れのリンクです。" },
      { status: 400 },
    );
  }

  // 3. userType 검증 — 토큰 사용 처리(updateMany) 보다 먼저 수행하여 검증 실패 시 토큰을
  //    소모하지 않도록 한다. (이전 위치는 토큰 사용 후 rollback 패턴이라 race window 가 컸음)
  const userTpParsed = z.enum(userTpValues).safeParse(resetToken.userType);
  if (!userTpParsed.success) {
    console.error("[POST /api/auth/password-reset/confirm] DB userType 검증 실패:", resetToken.userType);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
  const validUserTp = userTpParsed.data;

  // 4. 토큰 원자적 사용 처리 (TOCTOU 방지 — 동시 요청 시 하나만 성공)
  let updated;
  try {
    updated = await prisma.passwordResetToken.updateMany({
      where: { token, used: false },
      data: { used: true },
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] 토큰 사용 처리 실패:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "すでに使用されたリンクです。" },
      { status: 400 },
    );
  }

  // 4-1. 시공점(SEKO) — AS-IS Connector No.10 resetPwd 로 재설정하고 여기서 자체 종결한다.
  //      인증 소스가 Connector 이므로 아래 QSP 경로(userDetail + userPwdChg)를 타면 안 된다.
  //      `resetToken.userType`(DB 원본 문자열)으로 검사 — `validUserTp` 로 좁히면 아래 authRole
  //      폴백의 SEKO 분기가 dead code 로 판정되어 삭제 압력을 받고, 그 경우 SEKO 가 GENERAL 로
  //      강등된다(.claude/rules/api.md "본체와 폴백 매핑 일치").
  if (resetToken.userType === "SEKO") {
    const SEKO_LOG = "[POST /api/auth/password-reset/confirm][SEKO]";
    // 시공점 loginId = email. 단 request 라우트가 `userId` 는 소문자 정규화해 저장하고 `loginId` 는
    // 입력 원본을 유지하므로 대소문자가 다를 수 있다 — Connector 호출에는 원본인 `loginId` 를 쓴다.
    const sekoLoginId = resetToken.loginId ?? resetToken.userId;

    // `sekoResetPwd` 는 실패를 Result 로 돌려주지만 `ConfigError`(SEKO_API_KEY /
    // SEKO_CONNECTOR_BASE_URL 미설정·운영 https 위반)만은 rethrow 한다. 이 예외는 fetch **이전**
    // 에 발생하므로 Connector 에 요청이 도달하지 않았음이 확정 — 비밀번호는 그대로다.
    // 잡지 않으면 라우트 최상위 catch 로 빠져 토큰만 소모한 채 500 이 되는데, 설정 오류는
    // 결정적이라 링크를 재발급해도 같은 결과가 나온다(= 사용자 탈출구 없음). 롤백하고 종결한다.
    let resetResult: Awaited<ReturnType<typeof sekoResetPwd>>;
    try {
      resetResult = await sekoResetPwd(sekoLoginId, newPassword, SEKO_LOG);
    } catch (error) {
      console.error(`${SEKO_LOG} 설정 오류로 재설정 호출 불가:`, error);
      return rollbackAndRespond(
        token,
        "パスワードの再設定に失敗しました。しばらくしてから再度お試しください。",
        "パスワードの再設定に失敗しました。お手数ですが再度リンクの発行をお願いします。",
        500,
      );
    }
    if (!resetResult.ok) {
      if (resetResult.indeterminate) {
        // 타임아웃·응답 파싱 실패·스키마 불일치 — Connector 가 비밀번호를 이미 바꾼 뒤 응답만
        // 유실됐을 수 있다. 여기서 토큰을 되살리면 "재설정은 성공했는데 링크는 만료 전까지 다시
        // 쓸 수 있는" 상태가 되어 일회용 토큰 불변식이 깨진다 → 토큰은 소비 상태로 유지한다.
        // 사용자 탈출구는 (1) 새 비밀번호로 로그인, (2) 링크 재발급 두 가지이며 둘 다 안내한다.
        console.error(
          `${SEKO_LOG} 재설정 결과 불명 — 토큰 소비 유지 (status=${resetResult.error.status})`,
        );
        return NextResponse.json(
          {
            error:
              "パスワードが変更された可能性があります。新しいパスワードでログインをお試しください。ログインできない場合は、お手数ですが再度リンクの発行をお願いします。",
          },
          { status: resetResult.error.status },
        );
      }
      // Connector 가 명시적으로 거부(resultCode !== "S") — 비밀번호가 바뀌지 않았음이 확정이므로
      // 토큰을 되돌려 같은 링크로 재시도할 수 있게 한다.
      return rollbackAndRespond(
        token,
        "パスワードの再設定に失敗しました。しばらくしてから再度お試しください。",
        "パスワードの再設定に失敗しました。お手数ですが再度リンクの発行をお願いします。",
        resetResult.error.status,
      );
    }

    // 권한 사용가능여부(QpRole.isActive) 검증 — 로그인 라우트(SEKO 분기)와 동일 게이트.
    // 이 분기는 인증 쿠키를 발급하므로 로그인과 동일하게 통과해야 한다. 빠뜨리면 관리자가
    // SEKO 역할을 비활성화해도 "비밀번호 재설정 → 자동 로그인" 경로로 세션을 받을 수 있다
    // (middleware/rbac-guard 는 요청마다 isActive 를 재검사하지 않는 일회성 게이트).
    //
    // 위치는 resetPwd **성공 후** — 재설정 자체는 회원 본인이 발급받은 토큰으로 수행한 정당한
    // 요청이므로 되돌리지 않는다. 차단 대상은 세션 발급뿐이다. 따라서 토큰 롤백도 하지 않는다
    // (비밀번호는 이미 바뀐 상태 — 옛 비밀번호 기준 링크를 되살리면 혼선만 커진다).
    const sekoGate = await checkRoleActive("SEKO", SEKO_LOG);
    if (!sekoGate.active) {
      return NextResponse.json(
        { error: `パスワードは変更されました。${sekoGate.message}。管理者にお問い合わせください。` },
        { status: 403 },
      );
    }

    // 자동 로그인용 Bearer 확보 — 새 비밀번호로 재로그인한다.
    // 이 토큰이 없으면 세션에 sekoToken 이 없는 채로 홈에 진입해 마이페이지에서 401 이 나므로,
    // 실패 시 자동 로그인을 포기하고 로그인 화면으로 유도한다.
    // 비밀번호는 이미 변경된 상태이므로 토큰 롤백은 하지 않는다 — 되돌리면 옛 비밀번호 기준의
    // 재설정 링크가 되살아나 혼선만 커진다.
    // 여기서도 rethrow 되는 예외는 ConfigError 뿐이다. 앞선 resetPwd 가 성공했으므로 base URL 은
    // 이미 유효해 실질적으로 도달 불가하지만, 잡지 않으면 최상위 catch 의
    // "パスワード変更処理中にサーバーエラーが発生しました" 가 나간다 — 비밀번호가 이미 바뀐 사실을
    // **부정하는** 안내라 사용자가 옛 비밀번호로 재시도하게 된다.
    // 비밀번호는 이미 바뀐 상태이므로 아래 `!ok` 경로와 동일하게 토큰 롤백은 하지 않는다.
    let loginResult: Awaited<ReturnType<typeof sekoLogin>>;
    try {
      loginResult = await sekoLogin(sekoLoginId, newPassword, SEKO_LOG);
    } catch (error) {
      console.error(`${SEKO_LOG} 설정 오류로 자동 로그인 호출 불가:`, error);
      return NextResponse.json(
        {
          error:
            "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。",
        },
        { status: 500 },
      );
    }
    if (!loginResult.ok) {
      console.error(`${SEKO_LOG} 재설정 후 자동 로그인 실패 — status=${loginResult.error.status}`);
      return NextResponse.json(
        {
          error:
            "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。",
        },
        { status: 500 },
      );
    }

    const s = loginResult.data;
    const sekoUser: LoginUser = {
      userId: s.userId,
      userNm: `${s.sei ?? ""} ${s.mei ?? ""}`.trim() || null,
      userTp: "SEKO",
      compCd: null,
      compNm: null,
      // login 라우트와 동일 — 응답 email 이 없어도 loginId 로 보장(후속 Connector 호출 식별자).
      email: s.email ?? s.loginId,
      deptNm: null,
      authCd: null,
      storeLvl: null,
      statCd: null,
      authRole: "SEKO",
      // SEKO pwdInitYn 의미가 QSP 와 반대. 재설정 후에도 Connector 는 "N"(초기화 불요)을 주므로
      // TO-BE 는 "Y" 가 되어 personal-info popup 을 건너뛴다 (2026-08-14 preview 실측).
      pwdInitYn: s.pwdInitYn === "Y" ? "N" : "Y",
      twoFactorVerified: true, // 비밀번호 재설정 후 자동 로그인은 2차 인증 Skip (p.14 스펙)
      telNo: s.telNo,
      loginNotiYn: null,
      // Connector Bearer — 이 값이 없으면 마이페이지 전 라우트가 401 이 된다.
      sekoToken: s.token,
    };

    let sekoJwt: string;
    try {
      sekoJwt = await signToken(sekoUser);
    } catch (error) {
      console.error(`${SEKO_LOG} JWT 생성 실패:`, error);
      return NextResponse.json(
        {
          error:
            "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。",
        },
        { status: 500 },
      );
    }

    // sekoToken 은 클라이언트 응답에 노출하지 않는다 — httpOnly JWT 에만 보관.
    const sekoResponse = NextResponse.json({
      data: {
        message: "保存されました。",
        user: { ...sekoUser, sekoToken: undefined },
        requireTwoFactor: false,
      },
    });
    sekoResponse.cookies.set(COOKIE_NAME, sekoJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return sekoResponse;
  }

  // 4. QSP 유저정보 조회 (이메일 → loginId + 사용자 정보 획득)
  const detailParams = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email: resetToken.userId,
    userTp: resetToken.userType,
  });

  let loginId = resetToken.loginId ?? resetToken.userId; // 토큰에 loginId 있으면 우선, 없으면 email 폴백
  let detailData: z.infer<typeof qspUserDetailSchema>["data"] = null;
  // request 라우트가 모든 userType 에서 resolvedDetail.userId 를 loginId 컬럼에 저장하므로
  // STORE 외 (SEKO/GENERAL/ADMIN) 도 동일하게 loginId+email 동시 매칭으로 정확도 보장.
  // - GENERAL: loginId == email (request 라우트 cross-check 후 단일 회원 확정) → 추가 무해.
  // - SEKO/ADMIN: loginId 가 sekoId/adminId 등 email 과 다른 식별자 → email 단독 매칭 시
  //   동일 email 을 가진 다른 사용자가 잘못 매칭되는 채널 차단.
  // ※ QSP /user/detail 가 loginId+email 동시 파라미터를 AND 매칭으로 처리하는지는 request
  //   라우트(lookupQspUserForReset)가 단일 키로만 호출하던 사용 패턴과 다름 — QSP 스펙 검증
  //   권장 (양 키 동시 입력 시 어느 것을 우선/AND 처리하는지 명세 미확인).
  if (resetToken.loginId) {
    detailParams.set("loginId", resetToken.loginId);
  }
  try {
    const detailRes = await fetchWithLog(
      `${QSP_API.userDetail}?${detailParams.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: "[POST /api/auth/password-reset/confirm]",
        userId: maskEmail(resetToken.userId),
        userType: resetToken.userType,
      },
    );
    if (detailRes.ok) {
      let detailBody: unknown;
      try {
        detailBody = await detailRes.json();
      } catch (parseError) {
        console.error("[POST /api/auth/password-reset/confirm] userDetail JSON 파싱 실패:", parseError);
        detailBody = null;
      }
      const parsed = detailBody != null ? qspUserDetailSchema.safeParse(detailBody) : null;
      if (parsed?.success && parsed.data.data?.userId) {
        loginId = parsed.data.data.userId;
        detailData = parsed.data.data;
      } else if (parsed && !parsed.success) {
        console.error("[POST /api/auth/password-reset/confirm] userDetail 응답 스키마 불일치:", parsed.error.issues);
      }
    } else {
      console.warn(
        `[POST /api/auth/password-reset/confirm] userDetail 비정상 응답 — status=${detailRes.status}, userTp=${resetToken.userType}`,
      );
    }
  } catch (error) {
    console.error(
      "[POST /api/auth/password-reset/confirm] userDetail 조회 실패 (이후 fail-closed 분기에서 에러 반환):",
      error instanceof Error ? { message: error.message } : error,
    );
  }

  // detailData 누락 시 fail-closed — JWT 에 부정확한 회원 정보(userNm/compNm null) 가
  // 박혀 GNB 영역에 잘못된 회사명/사용자명이 표시되는 회귀를 차단.
  // 종전 GENERAL 만 fail-open 으로 진행하던 분기 통일 (모든 userType 동일 동작).
  if (!detailData) {
    console.error(
      `[POST /api/auth/password-reset/confirm] userDetail 조회 실패 — userTp=${resetToken.userType}`,
    );
    return rollbackAndRespond(token,
      "ユーザー情報を確認できません。しばらくしてから再度お試しください。",
      "ユーザー情報を確認できません。新しいパスワード初期化リンクをリクエストしてください。",
      500,
    );
  }

  // statCd 검증 — 활성("A") 외 모든 상태값 차단 (deny-list → allow-list 전환).
  // 종전 R 단일 차단은 향후 QSP 가 잠금/휴면 등 신규 상태 코드 추가 시 silent bypass 위험.
  // statCd === null 은 QSP 응답 누락/명세 변경 가능성을 고려해 fail-open 으로 통과(정상 회원
  // 회귀 차단 우선) — QSP statCd 도메인 명세 확정 시 strict allow-list 로 추가 강화 권장.
  // 토큰은 이미 used=true 로 소모된 상태이므로 차단 시 롤백하여 재시도 가능하게 한다.
  if (detailData.statCd != null && detailData.statCd !== "A") {
    console.warn(
      `[POST /api/auth/password-reset/confirm] 비활성 회원 비밀번호 초기화 차단 — statCd=${detailData.statCd}, userTp=${resetToken.userType}`,
    );
    return rollbackAndRespond(token,
      "このアカウントはご利用いただけません。",
      "このアカウントはご利用いただけません。",
      403,
    );
  }

  // 6. QSP 비밀번호 변경 API 호출 (chgType=I)
  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      QSP_API.userPwdChg,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          accsSiteCd: "QPARTNERS",
          userTp: resetToken.userType,
          loginId,
          chgType: "I",
          email: resetToken.userId,
          chgPwd: newPassword,
        }),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userPwdChg",
        callerRoute: "[POST /api/auth/password-reset/confirm]",
        userId: maskEmail(loginId),
        userType: resetToken.userType,
      },
    );
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] QSP API 호출 실패:", error);
    // QSP 네트워크 에러 — 비밀번호 변경 미도달 확실 → 토큰 롤백
    return rollbackAndRespond(token,
      "外部サーバーに接続できません。しばらくしてから再度お試しください。",
      "外部サーバーに接続できません。新しいパスワード初期化リンクをリクエストしてください。",
      502,
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비정상 응답:", qspResponse.status);
    // HTTP 에러 — QSP가 처리하지 않았을 가능성 높음 → 토큰 롤백
    return rollbackAndRespond(token,
      "外部サーバーエラーが発生しました。しばらくしてから再度お試しください。",
      "外部サーバーエラーが発生しました。新しいパスワード初期化リンクをリクエストしてください。",
      502,
    );
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] QSP 응답 JSON 파싱 실패:", error);
    // QSP가 처리했을 수 있으나 응답 파싱 실패 → 토큰 롤백 (QSP 비밀번호 변경은 멱등이므로 재시도 안전)
    return rollbackAndRespond(token,
      "パスワードが変更された可能性があります。新しいパスワードでログインするか、しばらくしてから再度お試しください。",
      "パスワードが変更された可能性があります。新しいパスワードでログインするか、新しい初期化リンクをリクエストしてください。",
      502,
    );
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success || parsed.data.result.resultCode !== "S") {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비밀번호 변경 실패:", qspBody);
    // QSP가 명시적으로 실패 반환 → 토큰 롤백
    return rollbackAndRespond(token,
      "パスワード変更に失敗しました。しばらくしてから再度お試しください。",
      "パスワード変更に失敗しました。新しいパスワード初期化リンクをリクエストしてください。",
      500,
    );
  }

  // 7. 자동 로그인 — JWT 발행 + 쿠키 설정
  // 비밀번호 변경은 이미 완료됨 — resolveAuthRole 실패로 전체 응답을 실패시키면 안 됨
  // GENERAL 사용자는 회원관리에서 할당한 authCd 가 JWT authRole 에 반영되도록 4번째 인자로 전달.
  let authRole: string;
  try {
    authRole = await resolveAuthRole(
      validUserTp,
      loginId,
      detailData?.storeLvl ?? null,
      detailData?.authCd ?? null,
    );
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] authRole 판별 실패, 기본값 사용:", error);
    // STORE 폴백은 항상 2ND_STORE 단일 매핑 — resolveAuthRole 실패 상황에서 storeLvl 만으로
    // 1ST 승격을 허용하면 silent privilege escalation 채널이 열리므로 fail-closed 단일화.
    // (.claude/rules/api.md "최소 권한 원칙" + password-init/route.ts 폴백 정책과 통일.)
    authRole = validUserTp === "ADMIN" ? "ADMIN"
      : validUserTp === "STORE" ? "2ND_STORE"
      : validUserTp === "SEKO" ? "SEKO"
      : "GENERAL";
  }

  // 권한 사용가능여부(QpRole.isActive) 검증 — 로그인 라우트 6-1 과 동일 게이트.
  // 위 SEKO 분기와 같은 이유로 QSP 경로(STORE/GENERAL/동적 권한)도 통과해야 한다. 여기가 빠지면
  // 로그인은 403 인데 "비밀번호 재설정 → 자동 로그인" 으로는 세션이 나가는 정책 불일치가 생긴다.
  // authRole 확정 후에 검사한다 — 검증 대상 roleCode 가 authRole 에서 도출되기 때문.
  const roleCodeToCheck = resolveGateRoleCode(authRole);
  if (roleCodeToCheck) {
    const gate = await checkRoleActive(
      roleCodeToCheck,
      "[POST /api/auth/password-reset/confirm]",
      { userTp: validUserTp, authRole },
    );
    if (!gate.active) {
      // 비밀번호는 이미 변경 완료 — SEKO 분기와 동일하게 토큰 롤백 없이 세션 발급만 차단한다.
      return NextResponse.json(
        { error: `パスワードは変更されました。${gate.message}。管理者にお問い合わせください。` },
        { status: 403 },
      );
    }
  }

  const user: LoginUser = {
    userId: loginId,
    userNm: detailData?.userNm ?? null,
    userTp: validUserTp,
    compCd: detailData?.compCd ?? null,
    compNm: detailData?.compNm ?? null,
    email: resetToken.userId,
    deptNm: detailData?.deptNm ?? null,
    authCd: detailData?.authCd ?? null,
    // 비번 재설정 직후 → 항상 "Y" (다음 로그인부터 personal-info popup 우선 분기 통과)
    pwdInitYn: "Y",
    storeLvl: detailData?.storeLvl ?? null,
    statCd: detailData?.statCd ?? null,
    authRole,
    twoFactorVerified: true, // 비밀번호 초기화 후 자동 로그인은 2FA Skip (p.14 스펙)
    // QSP compTelNo(회사 전화번호) → telNo (login/auto-login 라우트와 동일 매핑)
    telNo: detailData?.compTelNo ?? null,
  };

  let jwtToken: string;
  try {
    jwtToken = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    data: {
      message: "保存されました。",
      user,
      requireTwoFactor: false, // 비밀번호 초기화 후 로그인은 2차 인증 Skip (p.14 스펙)
    },
  });

  response.cookies.set(COOKIE_NAME, jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
 } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm]", error);
    return NextResponse.json(
      { error: "パスワード変更処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
