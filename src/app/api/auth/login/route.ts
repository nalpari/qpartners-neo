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
import { resolveAuthRole } from "@/lib/auth";

// POST /api/auth/login — QSP 로그인 프록시
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
            if (Number.isNaN(expiresAt.getTime())) {
              console.error("[POST /api/auth/login] 2FA 만료시각 계산 실패:", { secAuthDt, validityDays });
              requireTwoFactor = true;
            } else {
              requireTwoFactor = Date.now() >= expiresAt.getTime();
            }
          }
        }
      }
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
