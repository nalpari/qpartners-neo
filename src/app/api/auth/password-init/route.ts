import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";

import { z } from "zod";

import { getUserFromRequest, signToken, COOKIE_NAME, sessionInvalidResponse } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { qspResponseSchema } from "@/lib/schemas/signup";
import { validatePasswordPolicy } from "@/lib/schemas/signup";
import type { LoginUser } from "@/lib/schemas/auth";
import { resolveAuthRole } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sekoChangePwd } from "@/lib/seko-connector";

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
    compTelNo: z.string().nullable().optional(),
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

    // 2. 접근 제어 가드 — **초기화 필요 상태에서만** 호출 허용.
    //    이 라우트는 현재 비밀번호 검증 없이 새 비밀번호를 설정하므로(최초 로그인 전제),
    //    2FA 미완료 상태에서 열려 있으면 비밀번호가 유출된 계정에서 2FA 를 통째로 우회하는
    //    경로가 된다 — 로그인 → 2FA 팝업 무시 → 여기서 비밀번호 교체 → 재발급 JWT 는
    //    twoFactorVerified=true. 그래서 twoFactorVerified 는 판단에 쓰지 않는다.
    //
    //    ⚠️ 종전 조건은 `twoFactorVerified && pwdInitYn !== "N"` 이었다. "login route 가
    //    GENERAL/SEKO 의 twoFactorVerified 를 false 로 강제하므로 첫 조건만으로 충분" 이라는
    //    전제였는데, SEKO 2FA 배선(No.9) 이후 "2FA 필요 + 초기화 불요" 조합이 생기면서
    //    twoFactorVerified=false + pwdInitYn="Y" 가 가드를 통과하게 됐다.
    if (user.pwdInitYn !== "N") {
      return NextResponse.json(
        { error: "この操作は初回ログイン時のみ有効です" },
        { status: 403 },
      );
    }

    // 3. rate limit — 유저당 5분간 5회. 보안 모범 사례에 따라 인증 직후 / 검증 전에 적용해
    //    유효 페이로드 brute force 도 동일하게 차단되도록 한다 (Zod 파싱 비용 과다 발생 방지).
    if (!checkRateLimit(`pwd-change:${user.userId}`, 5, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429 },
      );
    }

    // 4. Request body 파싱 + Zod 검증
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

    // 4-1. 시공점(SEKO) — AS-IS Q.Partners Connector changePwd(chgType=I) 로 초기 설정 (QSP 미경유).
    //      SEKO 는 userDetail 상당 API 가 없고 회원정보는 로그인 응답으로 이미 JWT 에 반영되어 있으므로
    //      여기서 자체 종결한다(아래 QSP 경로 무손상).
    if (user.userTp === "SEKO") {
      if (!user.sekoToken) {
        console.error("[POST /api/auth/password-init] SEKO 세션 토큰 없음 — 재로그인 필요");
        return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
      }
      // 시공점 loginId = email (사양). 로그인 시 email ?? loginId 로 JWT 에 보장 저장.
      // 누락은 세션 결손 — 다른 식별자로 대체 전송하지 않고 재로그인 유도(mypage 라우트와 동일 정책).
      if (!user.email) {
        console.error("[POST /api/auth/password-init] SEKO email(=loginId) 누락 — 재로그인 필요");
        return sessionInvalidResponse("セッション情報が不完全です。再度ログインしてください");
      }

      const changeResult = await sekoChangePwd(
        { chgType: "I", loginId: user.email, newPwd: newPassword },
        user.sekoToken,
        "[POST /api/auth/password-init][SEKO]",
      );
      if (!changeResult.ok) {
        // Connector 인증 실패(토큰 만료 = AUTHENTICATION_ERROR)는 401 로 매핑된다.
        // 이때 인증 쿠키를 남기면 로컬 JWT 는 유효해 middleware 가 통과시키고 SEKO API 만
        // 반복 401 이 되어 세션이 고착된다 — 결손 케이스와 동일하게 쿠키를 만료시킨다.
        if (changeResult.error.status === 401) {
          return sessionInvalidResponse(changeResult.error.error);
        }
        return NextResponse.json(
          { error: changeResult.error.error },
          { status: changeResult.error.status },
        );
      }

      // JWT 재발급 — 초기화 완료 반영. 회원정보는 로그인 시점 값 유지(SEKO 재조회 API 불요),
      // Bearer 토큰(sekoToken)도 그대로 승계해 후속 마이페이지 호출이 끊기지 않도록 한다.
      const sekoUpdatedUser: LoginUser = {
        ...user,
        // 비번 설정 직후 → "Y"(초기화 불요). 다음 로그인부터 personal-info popup 미진입.
        pwdInitYn: "Y",
        // 초기화 직후 2FA skip — QSP 경로(같은 파일 아래 `twoFactorVerified: true`)와 동일 정책.
        // 최초 비밀번호 설정을 막 마친 세션이므로 본인 확인이 방금 이뤄진 것으로 본다.
        twoFactorVerified: true,
      };

      let sekoJwt: string;
      try {
        sekoJwt = await signToken(sekoUpdatedUser);
      } catch (error) {
        console.error("[POST /api/auth/password-init][SEKO] JWT 생성 실패:", error);
        return NextResponse.json(
          { error: "パスワードは変更されました。自動ログインに失敗しました。新しいパスワードでログインしてください。" },
          { status: 500 },
        );
      }

      // 클라이언트 응답에는 sekoToken(Connector Bearer) 을 노출하지 않는다 — httpOnly JWT 에만 보관.
      const sekoResponse = NextResponse.json({
        data: {
          message: "保存されました。",
          user: { ...sekoUpdatedUser, sekoToken: undefined },
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

    // 5. QSP userDetail 조회 — 최신 사용자 정보 획득 + loginId 확인
    // QSP userDetail 은 모든 userTp(GENERAL/STORE/ADMIN)에서 loginId(User ID)를 필수로 요구한다.
    // 종전 STORE 한정 분기는 ADMIN 최초 로그인에서 loginId 누락
    // ("User ID必須入力値が抜けています") → data:null → fail-closed 500 을 유발했다.
    // user.userId 는 login 응답이 전 타입에 내려주므로 항상 사용 가능.
    // email 은 비밀번호 초기화 흐름의 기존 매칭 정책에 따라 유지한다.
    const detailParams = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      email: user.email ?? "",
      userTp: user.userTp,
      loginId: user.userId,
    });

    let loginId = user.userId;
    let detailData: z.infer<typeof qspUserDetailSchema>["data"] = null;

    try {
      const detailRes = await fetchWithLog(
        `${QSP_API.userDetail}?${detailParams.toString()}`,
        { method: "GET", signal: AbortSignal.timeout(10_000) },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "userDetail",
          callerRoute: "[POST /api/auth/password-init]",
          userId: maskUserId(user.userId),
          userType: user.userTp,
        },
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

    // detailData 누락 시 fail-closed — JWT 에 stale/부정확한 회원 정보가 박혀
    // GNB 에 잘못된 값이 표시되거나 권한 판정이 어긋나는 회귀 차단.
    // password-reset/confirm 라우트와 동일 정책으로 통일 (PR #152 정책 일관성).
    if (!detailData) {
      console.error(`[POST /api/auth/password-init] userDetail 조회 실패 — userTp=${user.userTp}`);
      return NextResponse.json(
        { error: "ユーザー情報を確認できません。しばらくしてから再度お試しください。" },
        { status: 500 },
      );
    }

    // 6. QSP 비밀번호 변경 API 호출 (chgType=I: 초기 설정)
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
            userTp: user.userTp,
            loginId,
            chgType: "I",
            email: user.email,
            chgPwd: newPassword,
          }),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "userPwdChg",
          callerRoute: "[POST /api/auth/password-init]",
          userId: maskUserId(user.userId),
          userType: user.userTp,
        },
      );
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

    // 7. JWT 재발급 — 최신 사용자 정보 반영
    // GENERAL 사용자는 회원관리에서 할당한 authCd 가 JWT authRole 에 반영되도록
    // resolveAuthRole 4번째 인자로 전달 (detailData 우선, fallback user.authCd).
    let authRole: string;
    try {
      authRole = await resolveAuthRole(
        user.userTp,
        loginId,
        detailData?.storeLvl ?? user.storeLvl ?? null,
        detailData?.authCd ?? user.authCd ?? null,
      );
    } catch (error) {
      console.error("[POST /api/auth/password-init] authRole 판별 실패, 기본값 사용:", error);
      // 폴백 매핑은 resolveAuthRole 본체와 일치해야 한다(.claude/rules/api.md "최소 권한 원칙").
      // SEKO 는 위(4-1)에서 자체 종결하므로 현재는 도달하지 않지만, 그 분기가 이동·삭제될 때
      // 조용히 GENERAL 로 강등되지 않도록 전 유형을 명시적으로 열거한다.
      // (narrowing 된 user.userTp 를 그대로 쓰면 SEKO 비교가 dead code 로 판정되므로 string 으로 받는다)
      const userTpRaw: string = user.userTp;
      authRole = userTpRaw === "ADMIN" ? "ADMIN"
        : userTpRaw === "STORE" ? "2ND_STORE" // 최소 권한 — resolveAuthRole 실패 시 승격 방지
        : userTpRaw === "SEKO" ? "SEKO"
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
      // 비번 설정 직후 → 항상 "Y" (다음 로그인부터 personal-info popup 우선 분기 통과)
      pwdInitYn: "Y",
      statCd: detailData?.statCd ?? user.statCd,
      authRole,
      twoFactorVerified: true, // 비밀번호 변경 후 2FA Skip
      // QSP compTelNo(회사 전화번호) → telNo (login/auto-login 라우트와 동일 매핑) — 마이페이지 telNo 의존 컴포넌트 stale-blank 방지
      telNo: detailData?.compTelNo ?? user.telNo ?? null,
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
        // requireTwoFactor 는 dead field 였으나, 동일 응답 스키마를 공유하던 타 라우트와의
        // 일관성/하위 호환을 위해 명시 false 유지(updatedUser.twoFactorVerified=true 와 등가).
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
        // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 일반 500 에 흡수되면 운영자가 env 누락을 코드 버그·DB 장애와 구분할 수 없다
    // (.claude/rules/api.md "어떤 환경변수가 누락됐는지 에러 메시지에 명시").
    if (error instanceof ConfigError) {
      console.error("[POST /api/auth/password-init] 설정 에러:", error.name, "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요");
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
console.error("[POST /api/auth/password-init]", error);
    return NextResponse.json(
      { error: "パスワード変更処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
