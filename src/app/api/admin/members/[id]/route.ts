import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API } from "@/lib/config";
import {
  memberIdParamSchema,
  memberUpdateSchema,
  qspMemberDetailResponseSchema,
  qspUpdateResponseSchema,
  STATUS_TO_STAT_CD,
  lookupStatCd,
  lookupUserTypeLabel,
} from "@/lib/schemas/member";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/members/:id — 회원 상세정보
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = memberIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. QSP 회원 상세 API 호출
    const qspParams = new URLSearchParams({
      accsSiteCd: "QPARTNERS",
      userId: rawId,
    });

    let qspResponse: Response;
    try {
      qspResponse = await fetch(`${QSP_API.memberDetail}?${qspParams.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error: unknown) {
      console.error("[GET /api/admin/members/:id] QSP 회원 상세 API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[GET /api/admin/members/:id] QSP 비정상 응답:", qspResponse.status);
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
      console.error("[GET /api/admin/members/:id] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[GET /api/admin/members/:id] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S" || !parsed.data.data) {
      return NextResponse.json(
        { error: "会員情報が見つかりません" },
        { status: 404 },
      );
    }

    // 5. 응답 매핑 (QSP → TO-BE)
    const d = parsed.data.data;
    const mapped = {
      id: idResult.data,
      userId: d.userId,
      loginId: d.loginId ?? d.userId,
      userName: d.userNm ?? "",
      userNameKana: d.userNmKana ?? "",
      email: d.email ?? "",
      // 알 수 없는 QSP 값은 노출하지 않고 "unknown"으로 고정 (QSP 신뢰 경계 위반 방지 + OpenAPI enum 준수)
      userType: lookupUserTypeLabel(d.userTp) ?? "unknown",
      userRole: d.authCd ?? "",
      companyName: d.compNm ?? "",
      companyNameKana: d.compNmKana ?? "",
      zipcode: d.compPostCd ?? "",
      address: d.compAddr ?? "",
      telNo: d.compTelNo ?? "",
      faxNo: d.compFaxNo ?? "",
      corporateNo: d.corpNo ?? "",
      department: d.deptNm ?? "",
      jobTitle: d.pstnNm ?? "",
      // 2FA 상태: "Y"=활성, "N"=비활성, null=미설정 — 미설정과 비활성을 구분
      twoFactorEnabled:
        d.secAuthYn === "Y" ? true : d.secAuthYn === "N" ? false : null,
      loginNotification: d.loginNotiYn === "Y",
      attributeChangeNotification: d.attrChgNotiYn === "Y",
      status: lookupStatCd(d.statCd) ?? "unknown",
      newsRcptYn: d.newsRcptYn ?? "N",
      newsRcptDate: d.newsRcptDt ?? null,
      lastLoginAt: d.lastLoginDt ?? null,
      withdrawnAt: d.wdrawDt ?? null,
      withdrawnReason: d.wdrawRsn ?? null,
      createdAt: d.regDt ?? null,
      updatedAt: d.updDt ?? null,
      updatedBy: d.updBy ?? null,
    };

    console.log("[GET /api/admin/members/:id] 회원 상세 조회 완료");

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("[GET /api/admin/members/:id] 회원 상세 조회 실패:", error);
    return NextResponse.json(
      { error: "会員情報の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// PUT /api/admin/members/:id — 회원 상세정보 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. ID 파라미터 검증
    const { id: rawId } = await params;
    const idResult = memberIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    // 3. Request body 파싱
    let body: unknown;
    try {
      body = await request.json();
    } catch (error: unknown) {
      console.warn("[PUT /api/admin/members/:id] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "無効なリクエストです" },
        { status: 400 },
      );
    }

    const result = memberUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "入力内容に不備があります",
          details: result.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 },
      );
    }

    // 자기 자신 상태 변경 금지 — self-lockout 방지
    if (result.data.status !== undefined && rawId === user.userId) {
      return NextResponse.json(
        { error: "自分自身のアカウント状態は変更できません" },
        { status: 400 },
      );
    }

    // 4. userRole 변경 시 대상 회원 유형 검증 (일반회원만 가능)
    //
    // [TOCTOU 주의] 본 검증(QSP 상세 조회)과 아래의 QSP 업데이트 호출 사이에는
    // 짧은 경합 창(race window)이 존재한다. 동시에 다른 관리자가 동일 회원의
    // userTp을 ADMIN/STORE 등으로 변경하면, 본 요청이 GENERAL이 아닌 회원에게
    // authCd를 부여하여 권한 상승(privilege escalation)을 일으킬 수 있다.
    //
    // 근본 해결을 위해서는 QSP 업데이트 API에 `userTp=GENERAL` 조건 파라미터를
    // 추가하여 원자적으로 처리해야 한다(QSP 측 변경 필요 — 추후 작업 예정).
    // 그 전까지는 다음의 완화 조치를 적용한다:
    //   1) 검증 직후 즉시 업데이트 호출 (창 최소화)
    //   2) 관리자 동시 작업이 드문 운영 가정
    //   3) audit log를 통한 사후 탐지(추후 작업 예정)
    if (result.data.userRole !== undefined) {
      // 대상 회원 정보를 먼저 조회
      const checkParams = new URLSearchParams({
        accsSiteCd: "QPARTNERS",
        userId: rawId,
      });

      let checkResponse: Response;
      try {
        checkResponse = await fetch(`${QSP_API.memberDetail}?${checkParams.toString()}`, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error: unknown) {
        console.error("[PUT /api/admin/members/:id] QSP 회원 조회 실패:", error);
        return NextResponse.json(
          { error: "外部サーバーに接続できません" },
          { status: 502 },
        );
      }

      if (!checkResponse.ok) {
        console.error("[PUT /api/admin/members/:id] QSP userRole 검증 조회 비정상 응답:", checkResponse.status);
        return NextResponse.json(
          { error: "外部サーバーエラーが発生しました" },
          { status: 502 },
        );
      }

      let checkBody: unknown;
      try {
        checkBody = await checkResponse.json();
      } catch (error: unknown) {
        console.error("[PUT /api/admin/members/:id] QSP 응답 파싱 실패:", error);
        return NextResponse.json(
          { error: "外部サーバーの応答を処理できません" },
          { status: 502 },
        );
      }

      const checkParsed = qspMemberDetailResponseSchema.safeParse(checkBody);
      if (!checkParsed.success || !checkParsed.data.data) {
        return NextResponse.json(
          { error: "会員情報が見つかりません" },
          { status: 404 },
        );
      }

      if (checkParsed.data.data.userTp !== "GENERAL") {
        return NextResponse.json(
          { error: "ユーザー権限の変更は一般会員のみ可能です" },
          { status: 400 },
        );
      }
    }

    // 5. QSP 회원정보 수정 API 호출
    const updatePayload: Record<string, unknown> = {
      accsSiteCd: "QPARTNERS",
      userId: rawId,
      updBy: user.userId,
    };

    if (result.data.userRole !== undefined) updatePayload.authCd = result.data.userRole;
    if (result.data.twoFactorEnabled !== undefined) updatePayload.secAuthYn = result.data.twoFactorEnabled ? "Y" : "N";
    if (result.data.loginNotification !== undefined) updatePayload.loginNotiYn = result.data.loginNotification ? "Y" : "N";
    if (result.data.attributeChangeNotification !== undefined) updatePayload.attrChgNotiYn = result.data.attributeChangeNotification ? "Y" : "N";
    if (result.data.status !== undefined) updatePayload.statCd = STATUS_TO_STAT_CD[result.data.status];
    if (result.data.newsRcptYn !== undefined) updatePayload.newsRcptYn = result.data.newsRcptYn;

    let qspResponse: Response;
    try {
      qspResponse = await fetch(QSP_API.updateUser, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(updatePayload),
      });
    } catch (error: unknown) {
      console.error("[PUT /api/admin/members/:id] QSP 회원 수정 API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[PUT /api/admin/members/:id] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error: unknown) {
      console.error("[PUT /api/admin/members/:id] QSP 응답 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspUpdateResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error("[PUT /api/admin/members/:id] QSP 응답 스키마 불일치:", parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S") {
      console.warn("[PUT /api/admin/members/:id] QSP 수정 실패:", parsed.data.result.message);
      return NextResponse.json(
        { error: "会員情報の更新に失敗しました" },
        { status: 502 },
      );
    }

    console.log("[PUT /api/admin/members/:id] 회원 정보 수정 완료");

    return NextResponse.json({
      data: { message: "会員情報を更新しました" },
    });
  } catch (error: unknown) {
    console.error("[PUT /api/admin/members/:id] 회원 정보 수정 실패:", error);
    return NextResponse.json(
      { error: "会員情報の更新に失敗しました" },
      { status: 500 },
    );
  }
}
