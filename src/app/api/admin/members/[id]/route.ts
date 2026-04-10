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
import type { z } from "zod";

type Params = { params: Promise<{ id: string }> };
type QspMemberDetail = NonNullable<
  z.infer<typeof qspMemberDetailResponseSchema>["data"]
>;

/**
 * QSP userDetail 조회 공통 헬퍼.
 * 성공 시 `{ ok: true, detail }`, 실패 시 그대로 반환할 NextResponse를 돌려준다.
 * MF-4/MF-6 대응으로 PUT 핸들러가 self-guard, existence check, TOCTOU 재검증에 재사용한다.
 */
async function fetchQspMemberDetail(
  rawId: string,
  logTag: string,
): Promise<{ ok: true; detail: QspMemberDetail } | { ok: false; response: NextResponse }> {
  const qspParams = new URLSearchParams({ accsSiteCd: "QPARTNERS", userId: rawId });
  let qspResponse: Response;
  try {
    qspResponse = await fetch(`${QSP_API.userDetail}?${qspParams.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    console.error(`${logTag} QSP 회원 조회 실패:`, error);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーに接続できません" }, { status: 502 }),
    };
  }
  if (!qspResponse.ok) {
    console.error(`${logTag} QSP 비정상 응답:`, qspResponse.status);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーエラーが発生しました" }, { status: 502 }),
    };
  }
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error: unknown) {
    console.error(`${logTag} QSP 응답 파싱 실패:`, error);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーの応答を処理できません" }, { status: 502 }),
    };
  }
  const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(`${logTag} QSP 응답 스키마 불일치:`, parsed.error.issues);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーの応答形式が正しくありません" }, { status: 502 }),
    };
  }
  if (parsed.data.result.resultCode !== "S" || !parsed.data.data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "会員情報が見つかりません" }, { status: 404 }),
    };
  }
  return { ok: true, detail: parsed.data.data };
}

/**
 * 관리자가 대상 회원 자신인지 case-insensitive 로 판정.
 * MF-4: 단순 path rawId 비교 대신 QSP 의 canonical userId/loginId 를 사용해
 * 이메일 별칭·대소문자·공백 차이로 인한 self-guard 우회를 방지한다.
 */
function isSelfTarget(adminUserId: string, detail: QspMemberDetail): boolean {
  const admin = adminUserId.trim().toLowerCase();
  const candidates = [detail.userId, detail.loginId]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.trim().toLowerCase());
  return candidates.includes(admin);
}

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
      qspResponse = await fetch(`${QSP_API.userDetail}?${qspParams.toString()}`, {
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

    // 4. 대상 회원 QSP 상세 조회 (존재성 + canonical identifier + userType 확인)
    //    MF-4: 단순 path id 비교 대신 canonical userId/loginId 로 self-guard 수행
    //    MF-6: userRole 변경 시 GENERAL 사전 검증용. 추가로 update 직후 재조회로
    //          TOCTOU window 사후 탐지.
    //    WARNING 대응: userRole 미변경 경로에서도 존재 여부를 먼저 확인한다.
    const preDetailResult = await fetchQspMemberDetail(rawId, "[PUT /api/admin/members/:id]");
    if (!preDetailResult.ok) return preDetailResult.response;
    const preDetail = preDetailResult.detail;

    // 자기 자신 수정 가드 — self-lockout / self-escalation 방지
    // MF-4: 보호 대상을 status + userRole + twoFactorEnabled 로 확장한다.
    //       관리자가 본인 계정을 무력화(비활성/2FA off)하거나 권한을 마음대로
    //       조작할 수 없어야 한다.
    const modifiesSelfCritical =
      result.data.status !== undefined ||
      result.data.userRole !== undefined ||
      result.data.twoFactorEnabled !== undefined;
    if (modifiesSelfCritical && isSelfTarget(user.userId, preDetail)) {
      return NextResponse.json(
        { error: "自分自身のアカウントに対するこの変更は実行できません" },
        { status: 400 },
      );
    }

    // 4-a. userRole 변경은 일반회원에게만 허용 (사전 검증)
    if (result.data.userRole !== undefined && preDetail.userTp !== "GENERAL") {
      return NextResponse.json(
        { error: "ユーザー権限の変更は一般会員のみ可能です" },
        { status: 400 },
      );
    }
    // [TOCTOU 완화 — MF-6] 본 검증과 아래 QSP 업데이트 사이에는 경합 창이 존재한다.
    // QSP 업데이트 API 에 `expectedUserTp=GENERAL` 같은 원자적 조건을 추가하는 것이
    // 근본 해결이며 QSP 측 변경이 필요하다(추후 작업 예정).
    // 그 전까지 본 핸들러는 업데이트 직후 QSP 를 재조회하여 사후 검증을 수행하고,
    // 불일치 발견 시 CRITICAL 로그를 남겨 사후 탐지 가능하도록 한다.

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
      qspResponse = await fetch(QSP_API.updateUserDtlMng, {
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

    // 4-b. MF-6 사후 검증: userRole 변경 경로에서만 동일 회원을 재조회하여
    //      사전 검증 이후 userTp 가 변하지 않았는지 확인한다. 롤백은 불가하지만
    //      CRITICAL 감사 로그로 탐지 가능하게 한다.
    if (result.data.userRole !== undefined) {
      const postDetailResult = await fetchQspMemberDetail(rawId, "[PUT /api/admin/members/:id] POST-CHECK");
      if (postDetailResult.ok && postDetailResult.detail.userTp !== "GENERAL") {
        console.error(
          "[PUT /api/admin/members/:id] CRITICAL: TOCTOU 감지 — 업데이트 후 userTp 가 GENERAL 이 아님",
          { rawId, postUserTp: postDetailResult.detail.userTp, byAdmin: user.userId },
        );
      }
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
