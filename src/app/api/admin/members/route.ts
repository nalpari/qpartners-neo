import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { logError } from "@/lib/log-error";
import { parseQspDate } from "@/lib/qsp-member";
import {
  memberListQuerySchema,
  qspMemberListResponseSchema,
  STATUS_FILTER_TO_STAT_CD,
  lookupStatCd,
} from "@/lib/schemas/member";
import { getUserTypeLabelMap } from "@/lib/user-type-labels";

// GET /api/admin/members — 회원 목록 (시공점 제외)
export async function GET(request: NextRequest) {
  try {
    // 1. 관리자 권한 확인 — MEMBERS.read 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_MEMBER", "read");
    if (authResult instanceof NextResponse) return authResult;

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = request.nextUrl;
    const queryResult = memberListQuerySchema.safeParse({
      userId: searchParams.get("userId") ?? undefined,
      userName: searchParams.get("userName") ?? undefined,
      email: searchParams.get("email") ?? undefined,
      companyName: searchParams.get("companyName") ?? undefined,
      userType: searchParams.get("userType") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "パラメータが正しくありません", details: queryResult.error.issues },
        { status: 400 },
      );
    }

    const { userId, userName, email, companyName, userType, status, page, pageSize } = queryResult.data;

    // 3. QSP 회원관리 목록 조회 API 호출 (사양서 No.10 userListMng)
    //    QSP는 page/pageSize가 아닌 startRow/endRow 방식
    const { user } = authResult;
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;
    const params = new URLSearchParams({
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      loginId: user.userId,
      startRow: String(startRow),
      endRow: String(endRow),
    });
    // QSP userListMng 필드명 매핑: userId→userId, userName→userNm, email→email, companyName→compNm.
    // QSP 가 지원하지 않는 파라미터는 무시되지만, 서버에 불필요한 값을 보내지 않도록 trim 후 빈 값은 제외.
    if (userId) params.set("userId", userId);
    if (userName) params.set("userNm", userName);
    if (email) params.set("email", email);
    if (companyName) params.set("compNm", companyName);
    if (userType) params.set("userTp", userType);
    if (status) {
      params.set("statCd", STATUS_FILTER_TO_STAT_CD[status]);
    }

    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        `${QSP_API.userListMng}?${params.toString()}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(15_000),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "userListMng",
          callerRoute: "[GET /api/admin/members]",
          userId: maskEmail(user.userId),
          userType: "ADMIN",
        },
      );
    } catch (error: unknown) {
      console.error("[GET /api/admin/members] QSP 회원 목록 API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[GET /api/admin/members] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    // 4. QSP 응답 파싱
    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error: unknown) {
      console.error("[GET /api/admin/members] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspMemberListResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[GET /api/admin/members] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S") {
      console.error("[GET /api/admin/members] QSP 조회 실패:", parsed.data.result.message);
      return NextResponse.json(
        { error: "会員一覧の取得に失敗しました" },
        { status: 502 },
      );
    }

    // QSP 정상 응답이지만 결과 없음
    if (!parsed.data.data) {
      return NextResponse.json(
        { data: { totalCount: 0, page, pageSize, list: [] } },
      );
    }

    // 5. 응답 매핑 (QSP → TO-BE)
    const { list, totCnt } = parsed.data.data;
    if (list === null && totCnt > 0) {
      console.warn("[GET /api/admin/members] QSP totCnt > 0 이지만 list가 null:", { totCnt });
    }
    // userType 라벨은 코드관리(USER_TYPE) 디테일 기반 — 운영자가 codeName 변경 시 즉시 반영.
    // 5분 in-memory 캐시 + 코드관리 mutation 시 invalidate 로 stale 회피.
    const userTypeLabelMap = await getUserTypeLabelMap();
    const mappedList = (list ?? []).map((item) => ({
      id: item.userId,
      userId: item.userId,
      userName: item.userNm ?? "",
      userNameKana: item.userNmKana ?? "",
      email: item.email ?? "",
      userType: (item.userTp ? userTypeLabelMap.get(item.userTp) : undefined) ?? "unknown",
      companyName: item.compNm ?? "",
      status: lookupStatCd(item.statCd) ?? "unknown",
      // QSP loginDt(YYYY.MM.DD HH:mm:ss) / regDt(YYYY.MM.DD) 모두 ISO 8601 (+09:00) 로 정규화 —
      // 상세조회 + 백엔드 공통 timestamp 컨벤션(ISO 8601 +09:00) 과 통일.
      lastLoginAt: parseQspDate(item.loginDt),
      createdAt: parseQspDate(item.regDt),
    }));

    console.log(`[GET /api/admin/members] 회원 목록 조회 완료 — ${totCnt}건 중 ${mappedList.length}건 반환`);

    return NextResponse.json({
      data: {
        totalCount: totCnt,
        page,
        pageSize,
        list: mappedList,
      },
    });
  } catch (error: unknown) {
    logError("GET /api/admin/members", error);
    return NextResponse.json(
      { error: "会員一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}
