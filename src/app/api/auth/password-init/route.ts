import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";

import { getUserFromRequest, signToken, COOKIE_NAME } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { validatePasswordPolicy } from "@/lib/schemas/signup";
import type { LoginUser } from "@/lib/schemas/auth";
import { resolveAuthRole, type AuthRole } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// ─── 요청 스키마 ───

const passwordChangeSchema = z
  .object({
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください").max(100),
    confirmPassword: z.string().min(1, "パスワード確認は必須です"),
  })
  .refine((data) => validatePasswordPolicy(data.newPassword), {
    message: "パスワードは英大文字・英小文字・数字を組み合わせて8文字以上にしてください",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

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

// POST /api/auth/password-init — 세션 기반 비밀번호 변경 (판매점 최초 로그인용, p.12)
export async function POST(request: NextRequest) {
  try {
    // 1. JWT 인증 확인
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }

    // 2. rate limit — 유저당 5분간 5회
    if (!checkRateLimit(`pwd-change:${user.userId}`, 5, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429 },
      );
    }

    // 3. Request body 파싱 + Zod 검증
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/auth/password-init] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = passwordChangeSchema.safeParse(body);
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

    const { newPassword } = result.data;

    // 4. QSP userDetail 조회 — 최신 사용자 정보 획득 + loginId 확인
    const detailParams = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      email: user.email ?? "",
      userTp: user.userTp,
    });
    if (user.userTp === "STORE") {
      detailParams.set("loginId", user.userId);
    }

    let loginId = user.userId;
    let detailData: z.infer<typeof qspUserDetailSchema>["data"] = null;

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
          console.error("[POST /api/auth/password-init] userDetail JSON 파싱 실패:", parseError);
          detailBody = null;
        }
        const parsed = detailBody != null ? qspUserDetailSchema.safeParse(detailBody) : null;
        if (parsed?.success && parsed.data.data?.userId) {
          loginId = parsed.data.data.userId;
          detailData = parsed.data.data;
        } else if (parsed && !parsed.success) {
          console.error("[POST /api/auth/password-init] userDetail 응답 스키마 불일치:", parsed.error.issues);
        }
      } else {
        console.warn(
          `[POST /api/auth/password-init] userDetail 비정상 응답 — status=${detailRes.status}, userTp=${user.userTp}`,
        );
      }
    } catch (error) {
      console.error(
        "[POST /api/auth/password-init] userDetail 조회 실패:",
        error instanceof Error ? { message: error.message } : error,
      );
    }

    // ADMIN/STORE/SEKO는 loginId≠email일 수 있으므로 조회 실패 시 에러
    if (!detailData && user.userTp !== "GENERAL") {
      console.error(`[POST /api/auth/password-init] userDetail 조회 실패 — userTp=${user.userTp}`);
      return NextResponse.json(
        { error: "ユーザー情報を確認できません。しばらくしてから再度お試しください。" },
        { status: 500 },
      );
    }
    if (!detailData && user.userTp === "GENERAL") {
      console.warn("[POST /api/auth/password-init] GENERAL userDetail 조회 실패 — JWT 기존 세션 데이터로 진행");
    }

    // 5. QSP 비밀번호 변경 API 호출 (chgType=I: 초기 설정)
    let qspResponse: Response;
    try {
      qspResponse = await fetch(QSP_API.passwordChange, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          accsSiteCd: "QPARTNERS",
          userTp: user.userTp,
          loginId,
          chgType: "I",
          email: user.email,
          chgPwd: newPassword,
        }),
      });
    } catch (error) {
      console.error("[POST /api/auth/password-init] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません。しばらくしてから再度お試しください。" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/auth/password-init] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました。しばらくしてから再度お試しください。" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[POST /api/auth/password-init] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success || parsed.data.result.resultCode !== "S") {
      console.error("[POST /api/auth/password-init] QSP 비밀번호 변경 실패:", qspBody);
      return NextResponse.json(
        { error: "パスワード変更に失敗しました。しばらくしてから再度お試しください。" },
        { status: 500 },
      );
    }

    // 6. JWT 재발급 — pwdInitYn 해소 + 최신 사용자 정보 반영
    let authRole: AuthRole;
    try {
      authRole = await resolveAuthRole(user.userTp, loginId, detailData?.storeLvl ?? user.storeLvl ?? null);
    } catch (error) {
      console.error("[POST /api/auth/password-init] authRole 판별 실패, 기본값 사용:", error);
      authRole = user.userTp === "ADMIN" ? "ADMIN"
        : user.userTp === "STORE" ? "2ND_STORE" // 최소 권한 — resolveAuthRole 실패 시 승격 방지
        : user.userTp === "SEKO" ? "SEKO"
        : "GENERAL";
    }

    const updatedUser: LoginUser = {
      userId: loginId,
      userNm: detailData?.userNm ?? user.userNm,
      userTp: user.userTp,
      compCd: detailData?.compCd ?? user.compCd,
      compNm: detailData?.compNm ?? user.compNm,
      email: user.email,
      deptNm: detailData?.deptNm ?? user.deptNm,
      authCd: detailData?.authCd ?? user.authCd,
      storeLvl: detailData?.storeLvl ?? user.storeLvl,
      statCd: detailData?.statCd ?? user.statCd,
      authRole,
      twoFactorVerified: true, // 최초 로그인 비밀번호 변경 후 2FA Skip
      pwdInitYn: "N", // 비밀번호 변경 완료 → 초기화 상태 해소
    };

    let jwtToken: string;
    try {
      jwtToken = await signToken(updatedUser);
    } catch (error) {
      console.error("[POST /api/auth/password-init] JWT 생성 실패:", error);
      return NextResponse.json(
        { error: "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。" },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      data: {
        message: "保存されました。",
        user: updatedUser,
        requireTwoFactor: false,
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
    console.error("[POST /api/auth/password-init]", error);
    return NextResponse.json(
      { error: "パスワード変更処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
