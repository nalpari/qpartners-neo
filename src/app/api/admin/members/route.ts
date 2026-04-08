import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API } from "@/lib/config";
import {
  memberListQuerySchema,
  qspMemberListResponseSchema,
  STATUS_FILTER_TO_STAT_CD,
  lookupStatCd,
  lookupUserTypeLabel,
} from "@/lib/schemas/member";

// GET /api/admin/members — 회원 목록 (시공점 제외)
export async function GET(request: NextRequest) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = request.nextUrl;
    const queryResult = memberListQuerySchema.safeParse({
      keyword: searchParams.get("keyword") ?? undefined,
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

    const { keyword, userType, status, page, pageSize } = queryResult.data;

    // 3. QSP 회원 목록 API 호출
    const params = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set("keyword", keyword);
    if (userType) params.set("userTp", userType);
    if (status) {
      params.set("statCd", STATUS_FILTER_TO_STAT_CD[status]);
    }

    let qspResponse: Response;
    try {
      qspResponse = await fetch(`${QSP_API.memberList}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
      });
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
    const { list, totalCount } = parsed.data.data;
    const mappedList = list.map((item) => ({
      id: item.userId,
      userId: item.userId,
      userName: item.userNm ?? "",
      userNameKana: item.userNmKana ?? "",
      email: item.email ?? "",
      // 알 수 없는 QSP 값은 "unknown"으로 고정 (QSP 신뢰 경계 위반 방지)
      userType: lookupUserTypeLabel(item.userTp) ?? "unknown",
      companyName: item.compNm ?? "",
      status: lookupStatCd(item.statCd) ?? "unknown",
      lastLoginAt: item.lastLoginDt ?? null,
      createdAt: item.regDt ?? null,
    }));

    console.log(`[GET /api/admin/members] 회원 목록 조회 완료 — ${totalCount}건 중 ${mappedList.length}건 반환`);

    return NextResponse.json({
      data: {
        totalCount,
        page,
        pageSize,
        list: mappedList,
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/admin/members] 회원 목록 조회 실패:", error);
    return NextResponse.json(
      { error: "会員一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}
