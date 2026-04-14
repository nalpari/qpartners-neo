import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { getUserFromRequest } from "@/lib/jwt";
import { fetchQspUserDetail } from "@/lib/qsp-member";
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
      qspResponse = await fetchWithLog(
        `${QSP_API.userDetail}?${params.toString()}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "userDetail",
          callerRoute: "[GET /api/mypage/profile]",
          userId: maskEmail(user.userId),
          userType: user.userTp,
        },
      );
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

    // QSP는 user1stNm/user2ndNm이 null이고 userNm("姓 名")에 합쳐서 반환함
    // userNm을 공백 기준으로 분리하여 sei/mei fallback
    // 전각 공백(U+3000)도 구분자로 인식, 분리 불가(공백 없음) 시 양쪽 null
    const splitName = (nm: string | null): [string | null, string | null] => {
      if (!nm) return [null, null];
      const parts = nm.split(/[\s\u3000]+/, 2);
      if (parts.length < 2) return [null, null];
      return [parts[0], parts[1]];
    };
    const [seiFromNm, meiFromNm] = splitName(d.userNm);
    const [seiKanaFromNm, meiKanaFromNm] = splitName(d.userNmKana);

    // 회원유형별 응답 구성
    const profile: Record<string, unknown> = {
      userType,
      sei: d.user2ndNm ?? seiFromNm ?? null,
      mei: d.user1stNm ?? meiFromNm ?? null,
      seiKana: d.user2ndNmKana ?? seiKanaFromNm ?? null,
      meiKana: d.user1stNmKana ?? meiKanaFromNm ?? null,
      email: d.email,
      compNm: d.compNm,
      compNmKana: d.compNmKana,
      zipcode: d.compPostCd,
      address1: d.compAddr,
      address2: d.compAddr2,
      telNo: d.compTelNo,
      fax: d.compFaxNo,
      newsRcptYn: d.newsRcptYn ?? "N",
      newsRcptDate: d.newsRcptDate ?? null,
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

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "リクエスト形式が正しくありません" },
        { status: 400 },
      );
    }
    const result = profileUpdateSchema.safeParse({ ...body, userType: user.userTp });
    if (!result.success) {
      return NextResponse.json(
        { error: "入力内容に不備があります" },
        { status: 400 },
      );
    }

    const d = result.data;

    // 마이페이지 수정 정책:
    //   GENERAL — 전체 수정 가능
    //   ADMIN/STORE/SEKO — 뉴스레터만 수정 가능 (패스워드는 별도 API)
    // (SEKO는 위에서 early return 처리됨)
    //
    // updateUserDtl 필수값(사양서): userTp, userId, accsSiteCd,
    //   user1stNm, user2ndNm, user1stNmKana, user2ndNmKana,
    //   compNm, compNmKana, compPostCd, compAddr, compAddr2, compTelNo, newsRcptYn
    {
      let qspPayload: Record<string, unknown>;

      if (user.userTp === "GENERAL") {
        // GENERAL: 프론트에서 전체 필드를 받아서 전송
        qspPayload = {
          accsSiteCd: SITE_DEFAULTS.accsSiteCd,
          userId: user.userId,
          email: user.email,
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
          updBy: user.userId,
        };
      } else {
        // ADMIN/STORE: 뉴스레터만 수정 — 필수값은 QSP 기존 값으로 채움
        const detailResult = await fetchQspUserDetail(
          user.userId,
          user.userTp,
          "[PUT /api/mypage/profile]",
        );
        if (!detailResult.ok) {
          return NextResponse.json(
            { error: detailResult.error.error },
            { status: detailResult.error.status },
          );
        }
        const current = detailResult.detail;
        qspPayload = {
          accsSiteCd: SITE_DEFAULTS.accsSiteCd,
          userId: user.userId,
          loginId: user.userId,
          userTp: user.userTp,
          user1stNm: current.user1stNm ?? "",
          user2ndNm: current.user2ndNm ?? "",
          user1stNmKana: current.user1stNmKana ?? "",
          user2ndNmKana: current.user2ndNmKana ?? "",
          compNm: current.compNm ?? "",
          compNmKana: current.compNmKana ?? "",
          compPostCd: current.compPostCd ?? "",
          compAddr: current.compAddr ?? "",
          compAddr2: current.compAddr2 ?? "",
          compTelNo: current.compTelNo ?? "",
          compFaxNo: current.compFaxNo ?? "",
          newsRcptYn: d.newsRcptYn,
          updBy: user.userId,
        };
      }

      let qspResponse: Response;
      try {
        qspResponse = await fetchWithLog(
          QSP_API.updateUserDtl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify(qspPayload),
          },
          {
            system: "QSP",
            direction: "OUTBOUND",
            apiName: "updateUserDtl",
            callerRoute: "[PUT /api/mypage/profile]",
            userId: maskEmail(user.userId),
            userType: user.userTp,
          },
        );
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
      // QSP updateUserDtl: resultCode 기준으로만 성공 판정
      const resultCode = parsed.data.result.resultCode;
      const resultMsg = parsed.data.result.resultMsg;
      if (resultCode !== "S") {
        const truncatedMsg = (resultMsg ?? "").slice(0, QSP_LOG_MSG_MAX_LEN);
        console.error("[PUT /api/mypage/profile] QSP 수정 실패:", {
          ...buildUserLogContext(user),
          resultCode,
          resultMsg: truncatedMsg,
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
