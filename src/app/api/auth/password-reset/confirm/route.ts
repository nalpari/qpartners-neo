import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/schemas/password-reset";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import type { LoginUser } from "@/lib/schemas/auth";

/** 토큰 롤백 헬퍼 — QSP 실패 시 토큰을 재사용 가능하게 복원 */
async function rollbackToken(token: string) {
  try {
    await prisma.passwordResetToken.updateMany({
      where: { token, used: true },
      data: { used: false },
    });
  } catch (err) {
    console.error("[password-reset/confirm] 토큰 롤백 실패:", err);
  }
}

// POST /api/auth/password-reset/confirm — 비밀번호 변경 + 자동 로그인
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

  const { token, newPassword } = result.data;

  // 2. 토큰 재검증
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "유효하지 않거나 만료된 링크입니다." },
      { status: 400 },
    );
  }

  // 3. 토큰 원자적 사용 처리 (TOCTOU 방지 — 동시 요청 시 하나만 성공)
  const updated = await prisma.passwordResetToken.updateMany({
    where: { token, used: false },
    data: { used: true },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "이미 사용된 링크입니다." },
      { status: 400 },
    );
  }

  // 4. QSP 유저정보 조회 (이메일 → loginId + 사용자 정보 획득)
  const detailParams = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email: resetToken.userId,
    userTp: resetToken.userType,
  });

  let loginId = resetToken.userId; // 기본값: email (GENERAL)
  let detailData: Record<string, unknown> | null = null;
  try {
    const detailRes = await fetch(
      `${QSP_API.userDetail}?${detailParams.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) },
    );
    if (detailRes.ok) {
      const detailBody = await detailRes.json();
      if (detailBody?.data?.userId) {
        loginId = detailBody.data.userId;
        detailData = detailBody.data;
      }
    }
  } catch {
    // GENERAL은 email=loginId이므로 조회 실패해도 진행 가능
  }

  // W4: ADMIN/DEALER는 loginId≠email일 수 있으므로 조회 실패 시 에러
  if (!detailData && resetToken.userType !== "GENERAL") {
    console.error(
      `[POST /api/auth/password-reset/confirm] userDetail 조회 실패 — userTp=${resetToken.userType}`,
    );
    return NextResponse.json(
      { error: "사용자 정보를 확인할 수 없습니다" },
      { status: 500 },
    );
  }

  // 5. QSP 비밀번호 변경 API 호출 (chgType=I)
  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_API.passwordChange, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        accsSiteCd: "QPARTNERS",
        userTp: resetToken.userType,
        loginId,
        chgType: "I",
        email: resetToken.userId,
        chgPwd: newPassword,
      }),
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] QSP API 호출 실패:", error);
    // QSP 네트워크 에러 — 비밀번호 변경 미도달 확실 → 토큰 롤백
    await rollbackToken(token);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  if (!qspResponse.ok) {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비정상 응답:", qspResponse.status);
    // HTTP 에러 — QSP가 처리하지 않았을 가능성 높음 → 토큰 롤백
    await rollbackToken(token);
    return NextResponse.json(
      { error: "외부 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch {
    // QSP가 처리했을 수 있으나 응답 파싱 실패 → 토큰 롤백 (QSP 비밀번호 변경은 멱등이므로 재시도 안전)
    await rollbackToken(token);
    return NextResponse.json(
      { error: "비밀번호가 변경되었을 수 있습니다. 새 비밀번호로 로그인을 시도하시거나, 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  const parsed = qspResponseSchema.safeParse(qspBody);
  if (!parsed.success || parsed.data.result.resultCode !== "S") {
    console.error("[POST /api/auth/password-reset/confirm] QSP 비밀번호 변경 실패:", qspBody);
    // QSP가 명시적으로 실패 반환 → 토큰 롤백
    await rollbackToken(token);
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 6. 자동 로그인 — JWT 발행 + 쿠키 설정
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const user: LoginUser = {
    userId: loginId,
    userNm: str(detailData?.userNm) ?? null,
    userTp: resetToken.userType,
    compCd: str(detailData?.compCd) ?? null,
    compNm: str(detailData?.compNm) ?? null,
    email: resetToken.userId,
    deptNm: str(detailData?.deptNm) ?? null,
    authCd: str(detailData?.authCd) ?? null,
    storeLvl: str(detailData?.storeLvl) ?? null,
    statCd: str(detailData?.statCd) ?? null,
  };

  let jwtToken: string;
  try {
    jwtToken = await signToken(user);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] JWT 생성 실패:", error);
    return NextResponse.json(
      { error: "인증 처리 중 서버 오류가 발생했습니다" },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    data: {
      message: "저장되었습니다.",
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
}
