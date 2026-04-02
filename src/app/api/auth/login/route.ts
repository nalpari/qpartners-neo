import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  loginRequestSchema,
  qspLoginResponseSchema,
} from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { prisma } from "@/lib/prisma";

// POST /api/auth/login — QSP 로그인 프록시
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
    qspResponse = await fetch(QSP_API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        loginId,
        pwd,
        userTp,
        accsSiteCd: "QPARTNERS",
        // QSP API 규격상 로그인 요청 시 actLog="LOGOUT" 전송 (QSP 인터페이스 사양서 참조)
        actLog: "LOGOUT",
        requestId: crypto.randomUUID(),
      }),
    });
  } catch (error) {
    console.error("[POST /api/auth/login] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 인증 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/login] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 인증 서버 오류가 발생했습니다" },
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
      { error: "외부 인증 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspLoginResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/login] QSP 응답 스키마 불일치:", parsed.error);
    return NextResponse.json(
      { error: "외부 인증 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 성공/실패 판별
  if (qsp.result.resultCode !== "S" || !qsp.data) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 },
    );
  }

  // 5. 2차 인증 필요 여부 판별
  //    - secAuthYn !== "Y" → 불필요
  //    - pwdInitYn === "Y" (비밀번호 초기화 직후) → 불필요 (p.14 스펙)
  //    - secAuthDt + 공통코드 유효기간(SEC_AUTH_VALIDITY) ≤ 현재일시 → 필요
  let requireTwoFactor = false;

  if (qsp.data.secAuthYn === "Y" && qsp.data.pwdInitYn !== "Y") {
    // 공통코드에서 2차인증 유효기간(일수) 조회 — 실패 시 fail-closed (2FA 필요)
    let validityDays: number | null = null;
    try {
      const activeCode = await prisma.codeDetail.findFirst({
        where: {
          header: { headerCode: "SEC_AUTH_VALIDITY" },
          isActive: true,
        },
        orderBy: { id: "desc" },
        select: { code: true },
      });
      if (activeCode) {
        const days = Number(activeCode.code);
        if (Number.isFinite(days) && days > 0) {
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
      // secAuthDt 파싱 ("yyyy.MM.dd HH:mm:ss" → ISO 8601 + KST 오프셋) 후 유효기간 비교
      /** QSP secAuthDt는 KST(UTC+09:00) 기준 반환 */
      const QSP_TIMEZONE_OFFSET = "+09:00";
      const secAuthDt = qsp.data.secAuthDt;
      if (!secAuthDt) {
        // secAuthDt 없음 → 2FA 미인증 상태 → 필요
        requireTwoFactor = true;
      } else {
        const secAuthDtFormat = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;
        if (!secAuthDtFormat.test(secAuthDt)) {
          console.error("[POST /api/auth/login] secAuthDt 형식 불일치:", secAuthDt);
          requireTwoFactor = true;
        } else {
          const isoStr = secAuthDt.replace(/\./g, "-").replace(" ", "T") + QSP_TIMEZONE_OFFSET;
          const authDate = new Date(isoStr);
          if (Number.isNaN(authDate.getTime())) {
            console.error("[POST /api/auth/login] secAuthDt 파싱 실패:", secAuthDt);
            requireTwoFactor = true;
          } else {
            const expiresAt = new Date(authDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
            requireTwoFactor = new Date() >= expiresAt;
          }
        }
      }
    }
  }

  // 6. 세부 권한코드(authRole) 판별
  type AuthRole = "SUPER_ADMIN" | "ADMIN" | "1ST_STORE" | "2ND_STORE" | "SEKO" | "GENERAL";
  let authRole: AuthRole;

  switch (qsp.data.userTp) {
    case "ADMIN": {
      // ADMIN_ROLE 공통코드에서 loginId 대조 → SUPER_ADMIN 여부 판별
      let isSuperAdmin = false;
      try {
        const superAdminEntry = await prisma.codeDetail.findFirst({
          where: {
            header: { headerCode: "ADMIN_ROLE" },
            code: qsp.data.userId,
            isActive: true,
          },
          select: { id: true },
        });
        isSuperAdmin = superAdminEntry !== null;
      } catch (error) {
        console.error("[POST /api/auth/login] ADMIN_ROLE 조회 실패 — ADMIN으로 처리:", error);
      }
      authRole = isSuperAdmin ? "SUPER_ADMIN" : "ADMIN";
      break;
    }
    case "STORE":
      authRole = qsp.data.storeLvl === "2" ? "2ND_STORE" : "1ST_STORE";
      break;
    case "SEKO":
      authRole = "SEKO";
      break;
    default:
      authRole = "GENERAL";
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
  };

  let token: string;
  try {
    token = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/login] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "인증 처리 중 서버 오류가 발생했습니다" },
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
}
