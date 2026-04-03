import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { passwordResetConfirmSchema } from "@/lib/schemas/password-reset";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import type { LoginUser } from "@/lib/schemas/auth";
import { resolveAuthRole, type AuthRole } from "@/lib/auth";
import { userTpValues } from "@/lib/schemas/common";

/** QSP userDetail 응답에서 사용하는 필드만 검증 */
const qspUserDetailSchema = z.object({
  data: z.object({
    userId: z.string(),
    userNm: z.string().nullable().optional(),
    compCd: z.string().nullable().optional(),
    compNm: z.string().nullable().optional(),
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

  const { token, newPassword } = result.data;

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

  // 3. 토큰 원자적 사용 처리 (TOCTOU 방지 — 동시 요청 시 하나만 성공)
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

  // 4. QSP 유저정보 조회 (이메일 → loginId + 사용자 정보 획득)
  const detailParams = new URLSearchParams({
    accsSiteCd: "QPARTNERS",
    email: resetToken.userId,
    userTp: resetToken.userType,
  });

  let loginId = resetToken.loginId ?? resetToken.userId; // 토큰에 loginId 있으면 우선, 없으면 email 폴백
  let detailData: z.infer<typeof qspUserDetailSchema>["data"] = null;
  if (resetToken.loginId && resetToken.userType === "STORE") {
    detailParams.set("loginId", resetToken.loginId);
  }
  try {
    const detailRes = await fetch(
      `${QSP_API.userDetail}?${detailParams.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) },
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
      "[POST /api/auth/password-reset/confirm] userDetail 조회 실패 (non-GENERAL은 이후 에러 반환):",
      error instanceof Error ? { message: error.message } : error,
    );
    // GENERAL은 email=loginId이므로 조회 실패해도 진행 가능
  }

  // ADMIN/STORE/SEKO는 loginId≠email일 수 있으므로 조회 실패 시 에러
  if (!detailData && resetToken.userType !== "GENERAL") {
    console.error(
      `[POST /api/auth/password-reset/confirm] userDetail 조회 실패 — userTp=${resetToken.userType}`,
    );
    return rollbackAndRespond(token,
      "ユーザー情報を確認できません。しばらくしてから再度お試しください。",
      "ユーザー情報を確認できません。新しいパスワード初期化リンクをリクエストしてください。",
      500,
    );
  }
  if (!detailData && resetToken.userType === "GENERAL") {
    console.warn("[POST /api/auth/password-reset/confirm] GENERAL userDetail 조회 실패 — email 기반으로 진행");
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

  // 6. 자동 로그인 — JWT 발행 + 쿠키 설정
  // 비밀번호 변경은 이미 완료됨 — resolveAuthRole 실패로 전체 응답을 실패시키면 안 됨
  const userTpParsed = z.enum(userTpValues).safeParse(resetToken.userType);
  if (!userTpParsed.success) {
    console.error("[POST /api/auth/password-reset/confirm] DB userType 검증 실패:", resetToken.userType);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
  const validUserTp = userTpParsed.data;

  let authRole: AuthRole;
  try {
    authRole = await resolveAuthRole(validUserTp, loginId, detailData?.storeLvl ?? null);
  } catch (error) {
    console.error("[POST /api/auth/password-reset/confirm] authRole 판별 실패, 기본값 사용:", error);
    authRole = validUserTp === "ADMIN" ? "ADMIN"
      : validUserTp === "STORE" ? (detailData?.storeLvl === "1" ? "1ST_STORE" : "2ND_STORE")
      : validUserTp === "SEKO" ? "SEKO"
      : "GENERAL";
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
    storeLvl: detailData?.storeLvl ?? null,
    statCd: detailData?.statCd ?? null,
    authRole,
    twoFactorVerified: true, // 비밀번호 초기화 후 자동 로그인은 2FA Skip (p.14 스펙)
    pwdInitYn: "N", // 비밀번호 재설정 완료 → 초기화 상태 해소
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
