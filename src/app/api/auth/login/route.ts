import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";

import {
  loginRequestSchema,
  qspLoginResponseSchema,
} from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { sendLoginNotification } from "@/lib/notification-mail/login-mail";
import { extractClientIp } from "@/lib/notification-mail/utils";
import { resolveAuthRole } from "@/lib/auth";
import { parseQspDate } from "@/lib/qsp-member";
import { sekoLogin, parseSekoDate } from "@/lib/seko-connector";
import { evaluateTwoFactorRequirement } from "@/lib/sec-auth-policy";
import { checkRoleActive, resolveGateRoleCode } from "@/lib/role-active-gate";

// POST /api/auth/login — QSP 로그인 프록시
export async function POST(request: NextRequest) {
 try {
  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[POST /api/auth/login] Request body 파싱 실패:", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = loginRequestSchema.safeParse(body);
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

  const { loginId, pwd, userTp } = result.data;

  // ─── 시공점(SEKO) 분기 — AS-IS Q.Partners Connector 경유 (QSP 미경유) ───
  //    아래 QSP 경로는 무손상 — SEKO 는 여기서 자체 종결한다.
  if (userTp === "SEKO") {
    const sekoResult = await sekoLogin(loginId, pwd, "[POST /api/auth/login][SEKO]");
    if (!sekoResult.ok) {
      // 자격증명 거부(401)는 사용자 열거 방지를 위해 일반 메시지로, 인프라 장애(502류)는 구분해 응답 — QSP 경로와 동일.
      // (모든 실패를 401 로 뭉개면 커넥터 다운/스키마 불일치 등 장애가 "ID/PW 오류"로 오인됨)
      if (sekoResult.error.status === 401) {
        return NextResponse.json(
          { error: "IDまたはパスワードが正しくありません" },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: "外部認証サーバーエラーが発生しました" },
        { status: 502 },
      );
    }
    const s = sekoResult.data;

    // 권한 사용가능여부(QpRole.isActive) 검증 — QSP 경로(6-1)·password-reset/confirm 과 동일 정책.
    // 관리자가 SEKO 역할을 비활성화(isActive=false)하면 로그인 차단.
    const sekoGate = await checkRoleActive("SEKO", "[POST /api/auth/login][SEKO]");
    if (!sekoGate.active) {
      return NextResponse.json({ error: sekoGate.message }, { status: 403 });
    }

    // 2차 인증 필요 여부 — QSP 와 동일 정책(`sec-auth-policy`)을 그대로 쓴다.
    // SEKO 는 관리자 해제(secAuthYn) 대응 필드가 없어 adminDisabled=false 고정이고,
    // secAuthDt 는 login 응답값(note-51 로 추가됨, `YYYY-MM-DD HH:mm:ss`)을 쓴다.
    const { requireTwoFactor: sekoRequireTwoFactor, reason: sekoTwoFactorReason } =
      await evaluateTwoFactorRequirement({
        adminDisabled: false,
        secAuthDt: s.secAuthDt,
        parseDate: parseSekoDate,
        logTag: "[POST /api/auth/login][SEKO]",
      });

    // 운영 추적용 진단 로그 — QSP 경로와 동일 항목. PII 제외, 판정 근거만.
    console.log("[POST /api/auth/login][SEKO] 2FA 판정", {
      userTp: "SEKO",
      userId: maskEmail(s.loginId),
      hasSecAuthDt: !!s.secAuthDt,
      hasEmail: !!(s.email ?? s.loginId),
      requireTwoFactor: sekoRequireTwoFactor,
      twoFactorReason: sekoTwoFactorReason,
    });

    const sekoUser: LoginUser = {
      userId: s.userId,
      userNm: `${s.sei ?? ""} ${s.mei ?? ""}`.trim() || null,
      userTp: "SEKO",
      compCd: null,
      compNm: null,
      // 시공점 loginId=email(사양). 응답 email 이 null 이어도 loginId 로 보장 —
      // mypage 등 후속 SEKO 호출의 식별자(loginId) 결손/오전송 방지.
      email: s.email ?? s.loginId,
      deptNm: null,
      authCd: null,
      storeLvl: null,
      statCd: null,
      authRole: "SEKO",
      // SEKO pwdInitYn 의미가 QSP 와 반대 — SEKO "Y"=초기화 필요 → TO-BE "N"(최초 로그인) 로 매핑.
      pwdInitYn: s.pwdInitYn === "Y" ? "N" : "Y",
      // QSP 경로의 `!requireTwoFactor && pwdInitYn !== "N"` 과 같은 식 — 단 SEKO 는 pwdInitYn
      // 의미가 반대라 TO-BE 매핑 기준으로 쓰면 `s.pwdInitYn !== "Y"` 가 된다.
      // 초기화 필요("Y")면 2FA 판정과 무관하게 false 로 두어 personal-info popup
      // (초기화 흐름 → password-init SEKO 분기 → changePwd chgType=I) 로 먼저 보낸다.
      twoFactorVerified: !sekoRequireTwoFactor && s.pwdInitYn !== "Y",
      // SEKO telNo 는 개인 휴대전화(회사 전화 아님) — 문의하기 자동입력 목적상 의도적으로 JWT 에 포함.
      // JWT 는 httpOnly + 운영 HTTPS 로만 전송되어 유출 표면 제한. 장기적으로 on-demand fetch 검토 대상(PR #27 리뷰).
      telNo: s.telNo,
      loginNotiYn: null,
      // AS-IS Connector Bearer 토큰(24h) — 후속 Bearer API(getUserInfo 등) 호출용. JWT 에만 보관.
      sekoToken: s.token,
    };

    let sekoJwt: string;
    try {
      sekoJwt = await signToken(sekoUser);
    } catch (error) {
      console.error("[POST /api/auth/login][SEKO] JWT 생성 실패:", error);
      return NextResponse.json(
        { error: "認証処理中にサーバーエラーが発生しました" },
        { status: 500 },
      );
    }

    // 클라이언트 응답에는 sekoToken(Bearer) 를 노출하지 않는다 — httpOnly JWT 에만 보관.
    // (undefined 필드는 JSON 직렬화에서 제외됨)
    // dev 환경에 한해 _twoFactorReason 진단 메타 노출 — QSP 경로와 동일(production 미노출).
    const sekoDebugMeta = process.env.APP_ENV === "development"
      ? { _twoFactorReason: sekoTwoFactorReason }
      : {};
    const sekoResponse = NextResponse.json({
      data: { ...sekoUser, sekoToken: undefined, ...sekoDebugMeta },
    });
    sekoResponse.cookies.set(COOKIE_NAME, sekoJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8시간
    });
    return sekoResponse;
  }

  // 2. QSP API 호출 (STORE / GENERAL / ADMIN)
  const qspRequestBody = {
    loginId,
    pwd,
    userTp,
    accsSiteCd: "QPARTNERS",
    actLog: "LOGIN",
    requestId: crypto.randomUUID(),
  };

  // 디버그: DEBUG_QSP_LOGIN=true 시 터미널에서 그대로 재현 가능한 curl 명령을 stdout 에 출력.
  // pwd 평문이 노출되므로 운영 상시 활성화 금지 — 진단 시에만 일시 활성화.
  if (process.env.DEBUG_QSP_LOGIN === "true") {
    console.log(
      `[DEBUG_QSP_LOGIN] curl -X POST '${QSP_API.login}' -H 'Content-Type: application/json; charset=utf-8' -d ${JSON.stringify(JSON.stringify(qspRequestBody))}`,
    );
  }

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      QSP_API.login,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(qspRequestBody),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "login",
        callerRoute: "[POST /api/auth/login]",
        userId: maskEmail(loginId),
        userType: userTp,
      },
    );
  } catch (error) {
    console.error("[POST /api/auth/login] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "外部認証サーバーに接続できません" },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/login] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "外部認証サーバーエラーが発生しました" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error) {
    console.error("[POST /api/auth/login] QSP 응답 JSON 파싱 실패:", error);
    return NextResponse.json(
      { error: "外部認証サーバーの応答を処理できません" },
      { status: 502 },
    );
  }

  const parsed = qspLoginResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    // PII 마스킹: email, pwd 등 민감 필드 제거 후 원본 로깅
    const safeBody = typeof qspBody === "object" && qspBody !== null
      ? JSON.stringify(qspBody, (k, v) => ["email", "pwd", "password"].includes(k) ? "[MASKED]" : v as unknown)
      : String(qspBody);
    console.error("[POST /api/auth/login] QSP 응답 스키마 불일치:", parsed.error, "원본:", safeBody);
    return NextResponse.json(
      { error: "外部認証サーバーの応答形式が正しくありません" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 성공/실패 판별
  if (qsp.result.resultCode !== "S" || !qsp.data) {
    return NextResponse.json(
      { error: "IDまたはパスワードが正しくありません" },
      { status: 401 },
    );
  }

  // 4-1. 탭(요청 userTp)과 QSP 응답 userTp 일치 검증.
  //   QSP 는 loginId+pwd 위주로 인증해 STORE 계정이 SEKO 탭으로도 통과되던 결함을
  //   응답 시점에 차단. 후속 2FA 판정 / authRole 판별 / 로그인 알림 메일 (line 363) 등이
  //   모두 이 가드 아래에 있으므로 메일 false-positive 도 함께 방지된다.
  //   사용자 열거 방지를 위해 자격증명 실패와 동일 메시지/상태로 응답.
  //
  //   예외: ADMIN(SUPER_ADMIN 포함, QSP 상 동일 userTp="ADMIN")은 "판매점(STORE) 탭" 으로만 허용.
  //   ADMIN 전용 로그인 탭이 없어 판매점 탭이 관리자 진입점 역할을 한다. 시공점/일반 탭으로
  //   ADMIN 진입은 정책상 차단 유지.
  //
  //   QSP 동작 전제: QSP 는 요청 userTp 와 무관하게 계정의 실제 userTp 를 응답한다.
  //   따라서 ADMIN 계정이 STORE 탭(요청 userTp="STORE")으로 진입하더라도 qsp.data.userTp
  //   는 "ADMIN" 으로 회신되며, ADMIN 권한이 STORE 등급(1ST/2ND_STORE)으로 강등되는
  //   시나리오는 발생하지 않는다. 후속 resolveAuthRole 도 qsp.data.userTp 기준 분기.
  const isAdminViaDealerTab = qsp.data.userTp === "ADMIN" && userTp === "STORE";
  if (qsp.data.userTp !== userTp && !isAdminViaDealerTab) {
    console.warn("[POST /api/auth/login] userTp 불일치 — 탭과 계정 유형 다름", {
      requestedUserTp: userTp,
      actualUserTp: qsp.data.userTp,
      userId: maskEmail(qsp.data.userId),
    });
    return NextResponse.json(
      { error: "IDまたはパスワードが正しくありません" },
      { status: 401 },
    );
  }

  // 감사 trail: ADMIN 계정이 판매점 탭 경유로 진입한 경우 보안 로그에 기록.
  //   관리자 진입 경로 추적 + 비정상 패턴(특정 ADMIN 의 비정기적 STORE 탭 사용 등) 사후 분석용.
  //   PII 제외, userId 는 maskEmail 처리.
  if (isAdminViaDealerTab) {
    console.log("[POST /api/auth/login] ADMIN 계정 판매점 탭 진입 허용", {
      userId: maskEmail(qsp.data.userId),
      requestedUserTp: userTp,
    });
  }

  // 5. 2차 인증 필요 여부 판별 — 정책·판정은 `sec-auth-policy` 로 일원화(QSP·SEKO 공용).
  //    회원유형별로 판정을 따로 두면 재인증 주기가 조용히 갈라지므로 인자만 다르게 넘긴다.
  //    QSP 는 관리자 명시 해제(secAuthYn === "N")를 최우선 면제로 반영한다.
  const { requireTwoFactor, reason: twoFactorReason } = await evaluateTwoFactorRequirement({
    adminDisabled: qsp.data.secAuthYn === "N",
    secAuthDt: qsp.data.secAuthDt,
    parseDate: parseQspDate,
    logTag: "[POST /api/auth/login]",
  });

  // 운영 추적용 진단 로그 — 모든 회원 케이스(분기 진입 여부 무관)에서 출력해
  // "왜 면제됐는지" / "왜 요구됐는지" 항상 추적 가능하게 한다. PII 제외, 판정 근거만.
  console.log("[POST /api/auth/login] 2FA 판정", {
    userTp: qsp.data.userTp,
    userId: maskEmail(qsp.data.userId),
    secAuthYn: qsp.data.secAuthYn,
    hasSecAuthDt: !!qsp.data.secAuthDt,
    hasEmail: !!qsp.data.email,
    requireTwoFactor,
    twoFactorReason,
  });

  // 2FA 대상인데 이메일 없는 경우 서버에서 직접 차단 — 클라이언트 우회 방지
  if (requireTwoFactor && !qsp.data.email) {
    console.warn("[POST /api/auth/login] 2FA 대상이나 이메일 미등록 — 로그인 차단", {
      userId: maskEmail(qsp.data.userId),
      userTp: qsp.data.userTp,
    });
    return NextResponse.json(
      { error: "2段階認証に必要なメール情報が登録されていません。管理者にお問い合わせください。" },
      { status: 403 },
    );
  }

  // 6. 세부 권한코드(authRole) 판별
  // GENERAL 사용자는 회원관리에서 할당한 authCd 가 JWT authRole 에 반영되도록 4번째 인자로 전달.
  // (운영자가 권한관리 화면에서 정의한 동적 권한이 사용자 세션에 즉시 반영되도록 함)
  let authRole: Awaited<ReturnType<typeof resolveAuthRole>>;
  try {
    authRole = await resolveAuthRole(
      qsp.data.userTp,
      qsp.data.userId,
      qsp.data.storeLvl,
      qsp.data.authCd ?? null,
    );
  } catch (error) {
    console.error("[POST /api/auth/login] authRole 판별 실패, 기본값 사용:", error);
    authRole = qsp.data.userTp === "ADMIN" ? "ADMIN"
      : qsp.data.userTp === "STORE" ? (qsp.data.storeLvl === "1" ? "1ST_STORE" : "2ND_STORE")
      : qsp.data.userTp === "SEKO" ? "SEKO"
      : "GENERAL";
  }

  // 6-1. 권한 사용가능여부(QpRole.isActive) 검증
  // SUPER_ADMIN/ADMIN 은 시스템 권한이라 isActive 검증 대상이 아님 (항상 활성).
  // 나머지 시스템 역할 + 동적 권한(authCd 기반) 모두 검증 대상.
  const roleCodeToCheck = resolveGateRoleCode(authRole);
  if (roleCodeToCheck) {
    const gate = await checkRoleActive(roleCodeToCheck, "[POST /api/auth/login]", {
      userTp: qsp.data.userTp,
      authRole,
    });
    if (!gate.active) {
      return NextResponse.json({ error: gate.message }, { status: 403 });
    }
  }

  // 7. 클라이언트에 전달할 사용자 정보 추출
  const user: LoginUser = {
    userId: qsp.data.userId,
    userNm: qsp.data.userNm,
    userTp: qsp.data.userTp,
    compCd: qsp.data.compCd,
    compNm: qsp.data.compNm,
    email: qsp.data.email,
    deptNm: qsp.data.deptNm,
    authCd: qsp.data.authCd,
    storeLvl: qsp.data.storeLvl,
    statCd: qsp.data.statCd,
    // 최초 로그인 회원(N) → FE 가 personal-info popup 우선 표시 + 2FA 우회.
    pwdInitYn: qsp.data.pwdInitYn,
    authRole,
    // fail-closed: 2FA 필요 시 false, 불필요 시 true 명시 설정.
    // pwdInitYn=N 케이스(GENERAL/SEKO 도 2FA 미요구로 true 가 발급되던 충돌 방지) — false 강제하여
    // password-init 가드(`!twoFactorVerified` 조건)를 통과시켜 최초 비밀번호 설정 흐름 진입 가능.
    twoFactorVerified: !requireTwoFactor && qsp.data.pwdInitYn !== "N",
    // QSP compTelNo(회사 전화번호) → telNo로 전달 (문의하기 자동 입력용)
    telNo: qsp.data.compTelNo ?? null,
    // 2FA verify 단계에서 로그인 알림 메일 발송 여부 판단용 (Redmine #2214).
    loginNotiYn: qsp.data.loginNotiYn ?? null,
  };

  let token: string;
  try {
    token = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/login] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "認証処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }

  // 8. 로그인 알림 메일 발송 (Redmine #2125 + #2214 후속).
  //    조건: !requireTwoFactor && loginNotiYn === "Y" && email 등록됨
  //    - 2FA 미요구 사용자(STORE/SEKO/GENERAL 일반 로그인): 1차 로그인 성공 즉시 발송 (#2125 Q2 결정 유지)
  //    - 2FA 필수 사용자(ADMIN/SUPER_ADMIN 등): 2FA 검증 성공 시점에 발송 (#2214 — verify route 에서 처리)
  //      → 인증 미완료 상태에서 "로그인 성공" 메일이 먼저 도착하는 UX 혼란 제거.
  //    fire-and-forget — sendNotificationMail 내부 try-catch 흡수, 본 응답 무영향.
  //    inbound 자동로그인은 정책상 발송 제외 (#2125 Q3) — 본 라우트(`/api/auth/login`) 만 발송 진입점.
  if (!requireTwoFactor && qsp.data.loginNotiYn === "Y" && qsp.data.email) {
    // sendNotificationMail 내부 try-catch 가 SMTP/네트워크 예외를 흡수하지만
    // buildBodyHtml/formatReceivedAt 등 본 함수 내 동기 단계에서 예상 외 throw 시
    // unhandled rejection 가 발생할 수 있어 보강.
    void sendLoginNotification({
      to: qsp.data.email,
      userNm: qsp.data.userNm,
      loginAt: new Date(),
      clientIp: extractClientIp(request),
      callerRoute: "[POST /api/auth/login]",
    }).catch((error: unknown) => {
      console.warn("[POST /api/auth/login] 로그인 알림 메일 발송 처리 중 예외:", error);
    });
  }

  // 9. httpOnly 쿠키 설정.
  //    응답 페이로드: twoFactorVerified 단일 SSoT (= !requireTwoFactor).
  //    dev 환경에 한해 _twoFactorReason 진단 메타 노출 — production 에서는 절대 노출 안 함.
  const debugMeta = process.env.APP_ENV === "development"
    ? { _twoFactorReason: twoFactorReason }
    : {};
  const response = NextResponse.json({
    data: { ...user, ...debugMeta },
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });

  return response;
 } catch (error) {
        // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 일반 500 에 흡수되면 운영자가 env 누락을 코드 버그·DB 장애와 구분할 수 없다
    // (.claude/rules/api.md "어떤 환경변수가 누락됐는지 에러 메시지에 명시").
    if (error instanceof ConfigError) {
      console.error("[POST /api/auth/login] 설정 에러:", error.name, "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요");
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
console.error("[POST /api/auth/login]", error);
    return NextResponse.json(
      { error: "ログイン処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
