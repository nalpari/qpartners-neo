import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
import { qspUpdateResponseSchema } from "@/lib/schemas/member";
import {
  profileUpdateSchema,
  qspUserDetailResponseSchema,
} from "@/lib/schemas/mypage";

// QSP 에러 message 로그 길이 제한 (내부 SQL 에러 / PII 간접 노출 방어)
const QSP_LOG_MSG_MAX_LEN = 200;

// GENERAL 회원은 userId == email 이므로 로그 기록 시 반드시 제외한다
// (.claude/rules/api.md: "이메일 주소를 로그에 기록하지 않음")
function buildUserLogContext(user: { userId: string; userTp: string }) {
  return {
    userTp: user.userTp,
    ...(user.userTp !== "GENERAL" && { userId: user.userId }),
  };
}

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

    // QSP 가 email=null 로 응답한 계정은 본 API 가 지원하지 않는다 (loginUserSchema.email 은 nullable).
    // 데이터 정합성 이슈이므로 500 으로 승격하여 운영 알람에 노출시키고, 사용자는 재로그인 유도.
    if (!user.email) {
      console.error(
        "[GET /api/mypage/profile] JWT missing email",
        buildUserLogContext(user),
      );
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

    // QSP 가 email=null 로 응답한 계정은 본 API 가 지원하지 않는다 (loginUserSchema.email 은 nullable).
    // 데이터 정합성 이슈이므로 500 으로 승격하여 운영 알람에 노출시키고, 사용자는 재로그인 유도.
    if (!user.email) {
      console.error(
        "[PUT /api/mypage/profile] JWT missing email",
        buildUserLogContext(user),
      );
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
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }

    const result = profileUpdateSchema.safeParse({ ...(body as Record<string, unknown>), userType: user.userTp });
    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります", issues: result.error.issues },
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

    // QSP 마이페이지 회원정보 수정 API (POST /api/qpartners/user/updateUserDtl)
    // 사양서 v1.0 기준 필수: userTp, userId, accsSiteCd, user1stNm, user2ndNm,
    //   user1stNmKana, user2ndNmKana, compNm, compNmKana, compPostCd,
    //   compAddr, compAddr2, compTelNo, newsRcptYn
    {
      const qspPayload = {
        accsSiteCd: "QPARTNERS",
        userId: user.userId,
        userTp: user.userTp,
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
        bizNo: d.corporateNo,
      };

      let qspResponse: Response;
      try {
        qspResponse = await fetch(QSP_API.updateUserDtl, {
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
        // QSP message 에 내부 SQL 에러가 포함될 수 있어 로그 길이를 제한한다.
        // 절단 여부를 함께 기록하여 운영자가 전체 메시지 확보 필요성을 판단할 수 있게 한다.
        // fullLength 는 메시지 길이를 통해 내부 에러 구조를 역추론할 수 있어 제외한다.
        // qspResultSchema.message 는 z.string() (non-nullable) — safeParse 통과 시 string 보장
        const rawMessage = parsed.data.result.message;
        const truncatedMessage = rawMessage.slice(0, QSP_LOG_MSG_MAX_LEN);
        const truncated = rawMessage.length > QSP_LOG_MSG_MAX_LEN;
        console.error("[PUT /api/mypage/profile] QSP 비즈니스 에러:", {
          ...buildUserLogContext(user),
          resultCode: parsed.data.result.resultCode,
          truncatedMessage,
          truncated,
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
