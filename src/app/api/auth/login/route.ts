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
  //    화면설계서 정책:
  //      - 2FA 대상: 관리자 설정 `secAuthYn=Y` 회원
  //      - 비대상: pwdInitYn="Y" (초기 비밀번호 상태, p.14 스펙)
  //      - 유예: 가입일(regDt) + SEC_AUTH_VALIDITY > 현재 → 신규가입 유예기간 (팝업 미노출)
  //      - 유예 경과 후: secAuthDt 없거나 + validityDays < 현재 → 필요
  //      - 유예 경과 후: secAuthDt + validityDays > 현재 → 불필요 (최근 인증됨)
  let requireTwoFactor = false;

  if (qsp.data.secAuthYn === "Y" && qsp.data.pwdInitYn !== "Y") {
    // 공통코드(SEC_AUTH_VALIDITY) 에서 유효기간(일수) 조회 — 실패 시 fail-closed (2FA 필요).
    // 관리자 "코드관리" 화면에서 10/20/30일 등 여러 개 활성(isActive=Y) 상태로 등록되어도
    // `sortOrder` 오름차순 최상위(Sort Order = 1) 1건을 채택한다 — 동일 값("가입 후 유예기간"
    // 과 "secAuthDt 재인증 주기") 에 공용으로 적용.
    let validityDays: number | null = null;
    try {
      const activeCode = await prisma.codeDetail.findFirst({
        where: {
          header: { headerCode: "SEC_AUTH_VALIDITY" },
          isActive: true,
        },
        orderBy: { sortOrder: "asc" },
        select: { code: true, sortOrder: true },
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
    } else {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // (A) 가입일 유예 체크 — regDt + validityDays > now 면 신규가입 유예기간
      //    regDt 미제공(QSP 로그인 응답에 누락)이면 유예 스킵하고 (B) 로 폴백.
      let inRegGracePeriod = false;
      if (qsp.data.regDt) {
        const regIso = parseQspDate(qsp.data.regDt); // "YYYY-MM-DDTHH:mm:ss+09:00"
        if (regIso) {
          const regMs = new Date(regIso).getTime();
          if (!Number.isNaN(regMs)) {
            inRegGracePeriod = now < regMs + validityDays * MS_PER_DAY;
          } else {
            console.warn("[POST /api/auth/login] regDt 파싱 불가 — 유예 스킵");
          }
        }
      }

      if (inRegGracePeriod) {
        // 신규가입 유예기간 — 2FA 팝업 노출 안 함
        requireTwoFactor = false;
      } else {
        // (B) 유예 경과 — secAuthDt 기반 재인증 주기 판정
        const secAuthDt = qsp.data.secAuthDt;
        if (!secAuthDt) {
          // 유예 지났는데 한 번도 2FA 안 함 → 필요 (201T01 케이스)
          requireTwoFactor = true;
        } else {
          const authIso = parseQspDate(secAuthDt);
          if (!authIso) {
            console.error("[POST /api/auth/login] secAuthDt 파싱 실패:", secAuthDt);
            requireTwoFactor = true;
          } else {
            const authMs = new Date(authIso).getTime();
            if (Number.isNaN(authMs)) {
              console.error("[POST /api/auth/login] secAuthDt 만료 계산 실패:", secAuthDt);
              requireTwoFactor = true;
            } else {
              requireTwoFactor = now >= authMs + validityDays * MS_PER_DAY;
            }
          }
        }
      }

      // 운영 추적용 진단 로그 — PII 제외, 판정 근거만.
      console.log("[POST /api/auth/login] 2FA 판정", {
        userTp: qsp.data.userTp,
        userId: maskEmail(qsp.data.userId),
        secAuthYn: qsp.data.secAuthYn,
        pwdInitYn: qsp.data.pwdInitYn,
        hasRegDt: !!qsp.data.regDt,
        inRegGracePeriod,
        hasSecAuthDt: !!qsp.data.secAuthDt,
        validityDays,
        requireTwoFactor,
      });
    }
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

  // 8. httpOnly 쿠키 설정
  const response = NextResponse.json({
    data: { ...user, requireTwoFactor },
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
