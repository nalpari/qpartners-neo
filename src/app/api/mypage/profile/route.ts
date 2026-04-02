import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/jwt";
import { QSP_API } from "@/lib/config";
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
        { error: "인증이 필요합니다" },
        { status: 401 },
      );
    }

    // 시공점은 별도 API (seko-info)
    if (user.userTp === "SEKO") {
      return NextResponse.json(
        { error: "시공점 회원은 /api/mypage/seko-info를 사용해주세요" },
        { status: 400 },
      );
    }

    // QSP userDetail API 호출
    if (!user.email) {
      return NextResponse.json(
        { error: "이메일 정보가 없어 프로필을 조회할 수 없습니다" },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      email: user.email,
      userTp: user.userTp,
    });

    let qspResponse: Response;
    try {
      qspResponse = await fetch(`${QSP_API.userDetail}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error("[GET /api/mypage/profile] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "외부 서버에 연결할 수 없습니다" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[GET /api/mypage/profile] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "외부 서버 오류가 발생했습니다" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[GET /api/mypage/profile] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "외부 서버 응답을 처리할 수 없습니다" },
        { status: 502 },
      );
    }

    const parsed = qspUserDetailResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[GET /api/mypage/profile] QSP 응답 스키마 불일치:", parsed.error);
      return NextResponse.json(
        { error: "외부 서버 응답 형식이 올바르지 않습니다" },
        { status: 502 },
      );
    }

    const qsp = parsed.data;

    if (qsp.result.resultCode !== "S" || !qsp.data) {
      return NextResponse.json(
        { error: "사용자 정보를 조회할 수 없습니다" },
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
      { error: "프로필 조회 중 오류가 발생했습니다" },
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
        { error: "인증이 필요합니다" },
        { status: 401 },
      );
    }

    // 시공점은 별도 API (seko-info)
    if (user.userTp === "SEKO") {
      return NextResponse.json(
        { error: "施工店会員は /api/mypage/seko-info をご利用ください" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
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
        { error: "판매점은 FAX가 필수입니다" },
        { status: 400 },
      );
    }

    const d = result.data;

    // QSP 수정 API 호출 (판매점/일반)
    // 관리자는 QSP 업데이트하지 않음 (Q.ORDER T01만 — 향후 구현)
    if (user.userTp !== "ADMIN") {
      const qspPayload = {
        accsSiteCd: "QPARTNERS",
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
      };

      let qspResponse: Response;
      try {
        qspResponse = await fetch(QSP_API.userDetail, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(qspPayload),
        });
      } catch (error) {
        console.error("[PUT /api/mypage/profile] QSP API 호출 실패:", error);
        return NextResponse.json(
          { error: "외부 서버에 연결할 수 없습니다" },
          { status: 502 },
        );
      }

      if (!qspResponse.ok) {
        console.error("[PUT /api/mypage/profile] QSP 비정상 응답:", qspResponse.status);
        return NextResponse.json(
          { error: "외부 서버 오류가 발생했습니다" },
          { status: 502 },
        );
      }

      let qspBody: unknown;
      try {
        qspBody = await qspResponse.json();
      } catch (error) {
        console.error("[PUT /api/mypage/profile] QSP 응답 JSON 파싱 실패:", error);
        return NextResponse.json(
          { error: "외부 서버 응답을 처리할 수 없습니다" },
          { status: 502 },
        );
      }

      const parsed = qspUserDetailResponseSchema.safeParse(qspBody);
      if (!parsed.success) {
        console.error("[PUT /api/mypage/profile] QSP 응답 스키마 불일치:", parsed.error);
        return NextResponse.json(
          { error: "外部サーバーの応答形式が正しくありません" },
          { status: 502 },
        );
      }
      if (parsed.data.result.resultCode !== "S") {
        console.error("[PUT /api/mypage/profile] QSP 비즈니스 에러:", parsed.data.result.resultCode);
        return NextResponse.json(
          { error: "프로필 수정에 실패했습니다" },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      data: { message: "저장되었습니다" },
    });
  } catch (error) {
    console.error("[PUT /api/mypage/profile]", error);
    return NextResponse.json(
      { error: "프로필 수정 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
