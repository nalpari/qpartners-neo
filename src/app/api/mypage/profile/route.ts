import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { qspUpdateResponseSchema } from "@/lib/schemas/member";
import {
  profileUpdateSchema,
  qspUserDetailResponseSchema,
} from "@/lib/schemas/mypage";

// GET /api/mypage/profile — 내정보/회사정보 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    // 시공점은 별도 API (seko-info)
    if (user.userTp === "SEKO") {
      return NextResponse.json(
        { error: "施工店会員は /api/mypage/seko-info をご利用ください" },
        { status: 400 },
      );
    }

    // JWT 에 email 이 없는 것은 토큰 발급 단계의 서버 invariant 위반 (클라이언트 잘못 아님).
    // 4xx 로 반환하면 운영 알람 노이즈에 묻히므로 500 으로 올리고 사용자는 재로그인 유도.
    if (!user.email) {
      console.error("[GET /api/mypage/profile] JWT missing email", {
        userId: user.userId,
        userTp: user.userTp,
      });
      return NextResponse.json(
        { error: "ユーザー情報に不備があります。再ログインしてください" },
        { status: 500 },
      );
    }

    const params = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      email: user.email,
      userTp: user.userTp,
    });
    // ADMIN/STORE는 loginId ≠ email일 수 있으므로 loginId 필수 전달
    // (GENERAL은 loginId = email이므로 불필요)
    if (user.userTp === "ADMIN" || user.userTp === "STORE") {
      params.set("loginId", user.userId);
    }

    let qspResponse: Response;
    try {
      qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error("[GET /api/mypage/profile] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[GET /api/mypage/profile] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[GET /api/mypage/profile] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspUserDetailResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[GET /api/mypage/profile] QSP 응답 스키마 불일치:", parsed.error);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    const qsp = parsed.data;

    if (qsp.result.resultCode !== "S" || !qsp.data) {
      return NextResponse.json(
        { error: "ユーザー情報を照会できません" },
        { status: 404 },
      );
    }

    const d = qsp.data;
    const userType = user.userTp;

    // 회원유형별 응답 구성
    const profile: Record<string, unknown> = {
      userType,
      sei: d.user2ndNm,
      mei: d.user1stNm,
      seiKana: d.user2ndNmKana,
      meiKana: d.user1stNmKana,
      email: d.email,
      compNm: d.compNm,
      compNmKana: d.compNmKana,
      zipcode: d.compPostCd,
      address1: d.compAddr,
      address2: d.compAddr2,
      telNo: d.compTelNo,
      fax: d.compFaxNo,
      newsRcptYn: d.newsRcptYn,
      newsRcptDate: d.newsRcptDate,
    };

    // 회원유형별 표시 필드 (SEKO는 위에서 early return 처리됨)
    profile.department = d.deptNm;
    profile.jobTitle = d.pstnNm;
    if (userType === "STORE" || userType === "ADMIN") {
      profile.corporateNo = d.corporateNo;
    }
    if (userType === "GENERAL") {
      profile.withdrawAvailable = true;
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    console.error("[GET /api/mypage/profile]", error);
    return NextResponse.json(
      { error: "プロフィール照会中にエラーが発生しました" },
      { status: 500 },
    );
  }
}

// PUT /api/mypage/profile — 내정보/회사정보 수정
export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    // 시공점은 별도 API (seko-info)
    if (user.userTp === "SEKO") {
      return NextResponse.json(
        { error: "施工店会員は /api/mypage/seko-info をご利用ください" },
        { status: 400 },
      );
    }

    // 관리자 프로필 수정은 미구현 (Q.ORDER T01만 — 향후 구현)
    // body 파싱·검증 전에 조기 차단하여 불필요한 작업을 방지한다.
    if (user.userTp === "ADMIN") {
      return NextResponse.json(
        { error: "管理者のプロフィール修正はまだ対応されていません" },
        { status: 501 },
      );
    }

    // JWT 에 email 이 없는 것은 토큰 발급 단계의 서버 invariant 위반 (GET 핸들러와 동일 가드).
    // 4xx 가 아닌 500 으로 반환하여 운영 알람에 노출되게 하고, 사용자는 재로그인 유도.
    if (!user.email) {
      console.error("[PUT /api/mypage/profile] JWT missing email", {
        userId: user.userId,
        userTp: user.userTp,
      });
      return NextResponse.json(
        { error: "ユーザー情報に不備があります。再ログインしてください" },
        { status: 500 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[PUT /api/mypage/profile] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = profileUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: result.error.issues },
        { status: 400 },
      );
    }

    // 판매점은 fax 필수
    if (user.userTp === "STORE" && !result.data.fax) {
      return NextResponse.json(
        { error: "販売店はFAXが必須です" },
        { status: 400 },
      );
    }

    const d = result.data;

    // QSP 수정 API 호출 (판매점/일반)
    // NOTE: 이전 구현은 QSP_API.userDetail 에 PUT 으로 호출하여 QSP 가 405 를 반환하던 버그가 있었음.
    //       QSP 에서 사용자 업데이트는 `updateUser` (POST) 엔드포인트를 사용한다.
    //       (admin/members 라우트와 동일하게 POST + updateUser 조합을 사용)
    {
      const qspPayload = {
        accsSiteCd: "QPARTNERS",
        // QSP updateUser 의 수정 대상 키는 userId 이며, JWT 에서 추출한 값을 그대로 전달한다.
        userId: user.userId,
        email: user.email,
        userTp: user.userTp,
        // STORE 는 QSP updateUser 스펙상 loginId 를 별도 필드로 요구하므로 명시 전달한다.
        // (ADMIN 은 상단에서 501 처리되어 이 분기에 도달하지 않음)
        ...(user.userTp === "STORE" && { loginId: user.userId }),
        user1stNm: d.mei,
        user2ndNm: d.sei,
        user1stNmKana: d.meiKana,
        user2ndNmKana: d.seiKana,
        compNm: d.compNm,
        compNmKana: d.compNmKana,
        compPostCd: d.zipcode,
        compAddr: d.address1,
        compAddr2: d.address2,
        compTelNo: d.telNo,
        compFaxNo: d.fax,
        deptNm: d.department,
        pstnNm: d.jobTitle,
        newsRcptYn: d.newsRcptYn,
        updBy: user.userId,
      };

      let qspResponse: Response;
      try {
        qspResponse = await fetch(QSP_API.updateUser, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(qspPayload),
        });
      } catch (error) {
        console.error("[PUT /api/mypage/profile] QSP API 호출 실패:", error);
        return NextResponse.json(
          { error: "外部サーバーに接続できません" },
          { status: 502 },
        );
      }

      if (!qspResponse.ok) {
        console.error("[PUT /api/mypage/profile] QSP 비정상 응답:", qspResponse.status);
        return NextResponse.json(
          { error: "外部サーバーエラーが発生しました" },
          { status: 502 },
        );
      }

      let qspBody: unknown;
      try {
        qspBody = await qspResponse.json();
      } catch (error) {
        console.error("[PUT /api/mypage/profile] QSP 응답 JSON 파싱 실패:", error);
        return NextResponse.json(
          { error: "外部サーバーの応答を処理できません" },
          { status: 502 },
        );
      }

      const parsed = qspUpdateResponseSchema.safeParse(qspBody);
      if (!parsed.success) {
        console.error("[PUT /api/mypage/profile] QSP 응답 스키마 불일치:", parsed.error.issues);
        return NextResponse.json(
          { error: "外部サーバーの応答形式が正しくありません" },
          { status: 502 },
        );
      }
      if (parsed.data.result.resultCode !== "S") {
        // QSP message 에 내부 SQL 에러가 포함될 수 있어 로그 길이를 200자로 제한한다.
        // 절단 여부를 함께 기록하여 운영자가 전체 메시지 확보 필요성을 판단할 수 있게 한다.
        const fullMessage = parsed.data.result.message ?? "";
        const safeMessage = fullMessage.slice(0, 200);
        const truncated = fullMessage.length > 200;
        console.error("[PUT /api/mypage/profile] QSP 비즈니스 에러:", {
          userId: user.userId,
          userTp: user.userTp,
          resultCode: parsed.data.result.resultCode,
          safeMessage,
          truncated,
          fullLength: fullMessage.length,
        });
        return NextResponse.json(
          { error: "プロフィールの修正に失敗しました" },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      data: { message: "保存されました" },
    });
  } catch (error) {
    console.error("[PUT /api/mypage/profile]", error);
    return NextResponse.json(
      { error: "プロフィール修正中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
