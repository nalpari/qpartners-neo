import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  loginRequestSchema,
  qspLoginResponseSchema,
} from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { prisma } from "@/lib/prisma";
import { resolveAuthRole } from "@/lib/auth";
import { parseQspDate } from "@/lib/qsp-member";

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

  // 2. QSP API 호출
  const { loginId, pwd, userTp } = result.data;

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      QSP_API.login,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          loginId,
          pwd,
          userTp,
          accsSiteCd: "QPARTNERS",
          actLog: "LOGOUT",
          requestId: crypto.randomUUID(),
        }),
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

  // 5. 2차 인증 필요 여부 판별
  //    정책 (신규가입 유예 폐지, secAuthDt 단일 기준):
  //      - 2FA 대상: 관리자 설정 secAuthYn !== "N" (Y/null/undefined 모두 대상)
  //      - 비대상: pwdInitYn === "Y" (초기 비밀번호 상태, p.14 스펙) → 우선
  //      - 면제: secAuthYn === "N" (관리자 명시 해제)
  //      - 만료 판정: secAuthDt + SEC_AUTH_VALIDITY ≤ now → 필요
  //                   secAuthDt + SEC_AUTH_VALIDITY > now → 불필요 (최근 인증됨)
  //                   secAuthDt 없음 → 필요 (한 번도 2FA 안 함)
  //
  //    [공용 코드 정책]
  //      `SEC_AUTH_VALIDITY` 는 secAuthDt 재인증 주기 단일 용도로 사용한다.
  //      관리자 "코드관리" 화면에서 여러 개 활성(isActive=Y)이면 sortOrder 오름차순
  //      최상위 1건을 채택. 등록/수정 단계에서 1~90 정수 상한 가드
  //      (validateSecAuthValidityCode)가 적용되므로 이 시점에 도달하는 값은 정상 범위.
  //      그래도 런타임 fail-closed 는 유지한다.
  let requireTwoFactor = false;
  // 진단 메타 — dev 환경 응답 노출 + 운영 로그 두 곳에서 동일 사유 표기.
  type TwoFactorReason =
    | "DISABLED_BY_ADMIN"
    | "PWD_INIT_PRIORITY"
    | "FIRST_TIME_REQUIRED"
    | "EXPIRED_REQUIRED"
    | "WITHIN_VALIDITY"
    | "FAIL_CLOSED";
  let twoFactorReason: TwoFactorReason = "DISABLED_BY_ADMIN";

  // 사양: "2단계 인증 대상 = 회원관리 데이터 중 2단계 인증 해제가 체크되지 않은 회원"
  // → secAuthYn === "N" (해제 명시) 만 면제, "Y"/null/undefined 모두 대상.
  if (qsp.data.pwdInitYn === "Y") {
    twoFactorReason = "PWD_INIT_PRIORITY";
  } else if (qsp.data.secAuthYn !== "N") {
    // 공통코드(SEC_AUTH_VALIDITY) 에서 유효기간(일수) 조회 — 실패 시 fail-closed (2FA 필요).
    let validityDays: number | null = null;
    try {
      const activeCode = await prisma.codeDetail.findFirst({
        where: {
          header: { headerCode: "SEC_AUTH_VALIDITY" },
          isActive: true,
        },
        orderBy: { sortOrder: "asc" },
        select: { code: true },
      });
      if (activeCode) {
        const days = Number(activeCode.code);
        if (Number.isSafeInteger(days) && days > 0) {
          validityDays = days;
        } else {
          console.error("[POST /api/auth/login] SEC_AUTH_VALIDITY 값 이상:", activeCode.code);
        }
      } else {
        console.warn("[POST /api/auth/login] SEC_AUTH_VALIDITY 공통코드 미등록 — 2FA 필수 처리");
      }
    } catch (error) {
      console.error("[POST /api/auth/login] 2FA 유효기간 조회 실패 — 2FA 필요로 처리:", error);
    }

    if (validityDays === null) {
      // 유효기간 조회 실패 또는 값 이상 → fail-closed
      requireTwoFactor = true;
      twoFactorReason = "FAIL_CLOSED";
    } else {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // secAuthDt 단일 기준 — 신규가입 유예 폐지.
      const secAuthDt = qsp.data.secAuthDt;
      if (!secAuthDt) {
        // 한 번도 2FA 안 함 → 필요
        requireTwoFactor = true;
        twoFactorReason = "FIRST_TIME_REQUIRED";
      } else {
        const authIso = parseQspDate(secAuthDt);
        if (!authIso) {
          // PII 노출 방지: 원본 문자열 대신 길이만 로깅 (parseQspDate 내부 패턴과 일치).
          console.error(
            "[POST /api/auth/login] secAuthDt 파싱 실패 — length:",
            secAuthDt.length,
          );
          requireTwoFactor = true;
          twoFactorReason = "FAIL_CLOSED";
        } else {
          const authMs = new Date(authIso).getTime();
          if (Number.isNaN(authMs)) {
            console.error(
              "[POST /api/auth/login] secAuthDt 만료 계산 실패 — length:",
              secAuthDt.length,
            );
            requireTwoFactor = true;
            twoFactorReason = "FAIL_CLOSED";
          } else {
            requireTwoFactor = now >= authMs + validityDays * MS_PER_DAY;
            twoFactorReason = requireTwoFactor ? "EXPIRED_REQUIRED" : "WITHIN_VALIDITY";
          }
        }
      }
    }
  }

  // 운영 추적용 진단 로그 — 모든 회원 케이스(분기 진입 여부 무관)에서 출력해
  // "왜 면제됐는지" / "왜 요구됐는지" 항상 추적 가능하게 한다. PII 제외, 판정 근거만.
  console.log("[POST /api/auth/login] 2FA 판정", {
    userTp: qsp.data.userTp,
    userId: maskEmail(qsp.data.userId),
    secAuthYn: qsp.data.secAuthYn,
    pwdInitYn: qsp.data.pwdInitYn,
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
  let authRole: Awaited<ReturnType<typeof resolveAuthRole>>;
  try {
    authRole = await resolveAuthRole(qsp.data.userTp, qsp.data.userId, qsp.data.storeLvl);
  } catch (error) {
    console.error("[POST /api/auth/login] authRole 판별 실패, 기본값 사용:", error);
    authRole = qsp.data.userTp === "ADMIN" ? "ADMIN"
      : qsp.data.userTp === "STORE" ? (qsp.data.storeLvl === "1" ? "1ST_STORE" : "2ND_STORE")
      : qsp.data.userTp === "SEKO" ? "SEKO"
      : "GENERAL";
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
    authRole,
    // fail-closed: 2FA 필요 시 false, 불필요 시 true 명시 설정
    twoFactorVerified: !requireTwoFactor,
    pwdInitYn: qsp.data.pwdInitYn,
    // QSP compTelNo(회사 전화번호) → telNo로 전달 (문의하기 자동 입력용)
    telNo: qsp.data.compTelNo ?? null,
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

  // 8. httpOnly 쿠키 설정.
  //    응답 페이로드: twoFactorVerified 단일 SSoT (= !requireTwoFactor).
  //    dev 환경에 한해 _twoFactorReason 진단 메타 노출 — production 에서는 절대 노출 안 함.
  const debugMeta = process.env.NODE_ENV === "development"
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
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json(
      { error: "ログイン処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
