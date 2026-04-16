import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { fetchQspUserDetail } from "@/lib/qsp-member";
import type { QspMemberDetail } from "@/lib/qsp-member";
import {
  memberIdParamSchema,
  memberUpdateSchema,
  qspUpdateResponseSchema,
  STATUS_TO_STAT_CD,
  lookupStatCd,
  lookupUserTypeLabel,
  defaultAuthCdFromUserTp,
} from "@/lib/schemas/member";
import { userTpSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

const QSP_LOG_MSG_MAX_LEN = 200;

/**
 * 관리자가 대상 회원 자신인지 case-insensitive 로 판정.
 * MF-4: 단순 path rawId 비교 대신 QSP 의 canonical userId/loginId 를 사용해
 * 이메일 별칭·대소문자·공백 차이로 인한 self-guard 우회를 방지한다.
 */
function isSelfTarget(adminUserId: string, detail: QspMemberDetail): boolean {
  const admin = adminUserId.trim().toLowerCase();
  return detail.userId.trim().toLowerCase() === admin;
}

// GET /api/admin/members/:id — 회원 상세정보
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인
    const authResult = requireAdmin(request.headers);
    if (authResult instanceof NextResponse) return authResult;

    // 2. ID/userTp 파라미터 검증
    const { id: rawId } = await params;
    const idResult = memberIdParamSchema.safeParse(rawId);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "IDが正しくありません" },
        { status: 400 },
      );
    }

    const userTpResult = userTpSchema.safeParse(request.nextUrl.searchParams.get("userTp"));
    if (!userTpResult.success) {
      return NextResponse.json(
        { error: "ユーザータイプが不正です" },
        { status: 400 },
      );
    }
    const userTp = userTpResult.data;

    // 3. QSP 유저 정보 조회 (사양서 No.13 userDetail)
    const detailResult = await fetchQspUserDetail(rawId, userTp, "[GET /api/admin/members/:id]");

    // QSP에서 삭제/탈퇴 회원은 F_NOT_USER로 데이터 미반환 → 빈 데이터로 정상 응답
    if (!detailResult.ok) {
      // 502(외부 서버 오류)는 그대로 에러 반환
      if (detailResult.error.status !== 404) {
        return NextResponse.json({ error: detailResult.error.error }, { status: detailResult.error.status });
      }

      console.warn("[GET /api/admin/members/:id] QSP 미조회 회원 — 빈 데이터로 응답");
      return NextResponse.json({
        data: {
          id: idResult.data,
          userId: rawId,
          userName: "",
          userNameKana: "",
          firstName: "",
          lastName: "",
          firstNameKana: "",
          lastNameKana: "",
          email: "",
          userType: "unknown",
          userRole: "",
          companyName: "",
          companyNameKana: "",
          zipcode: "",
          address: "",
          address2: "",
          telNo: "",
          faxNo: "",
          department: "",
          jobTitle: "",
          twoFactorEnabled: null,
          loginNotification: false,
          attributeChangeNotification: false,
          status: "unknown",
          newsRcptYn: "N",
          notFoundInQsp: true,
        },
      });
    }

    // 4. 응답 매핑 (QSP → TO-BE)
    const d = detailResult.detail;
    const mapped = {
      id: idResult.data,
      userId: d.userId,
      userName: d.userNm ?? "",
      userNameKana: d.userNmKana ?? "",
      firstName: d.user1stNm ?? "",
      lastName: d.user2ndNm ?? "",
      firstNameKana: d.user1stNmKana ?? "",
      lastNameKana: d.user2ndNmKana ?? "",
      email: d.email ?? "",
      userType: lookupUserTypeLabel(d.userTp) ?? "unknown",
      userRole: d.authCd ?? "",
      companyName: d.compNm ?? "",
      companyNameKana: d.compNmKana ?? "",
      zipcode: d.compPostCd ?? "",
      address: d.compAddr ?? "",
      address2: d.compAddr2 ?? "",
      telNo: d.compTelNo ?? "",
      faxNo: d.compFaxNo ?? "",
      department: d.deptNm ?? "",
      jobTitle: d.pstnNm ?? "",
      twoFactorEnabled:
        d.secAuthYn === "Y" ? true : d.secAuthYn === "N" ? false : null,
      loginNotification: d.loginNotiYn === "Y",
      attributeChangeNotification: d.attrChgYn === "Y",
      status: lookupStatCd(d.statCd) ?? "unknown",
      newsRcptYn: d.newsRcptYn ?? "N",
      notFoundInQsp: false,
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

    // 4. userTp 파라미터 검증 + 대상 회원 QSP 상세 조회
    const userTpResult = userTpSchema.safeParse(request.nextUrl.searchParams.get("userTp"));
    if (!userTpResult.success) {
      return NextResponse.json(
        { error: "ユーザータイプが不正です" },
        { status: 400 },
      );
    }
    const userTp = userTpResult.data;

    const preDetailResult = await fetchQspUserDetail(rawId, userTp, "[PUT /api/admin/members/:id]");
    // QSP 상세조회 실패 시: 502(외부 서버 오류)만 차단, 404(삭제/탈퇴)는 업데이트 시도
    if (!preDetailResult.ok && preDetailResult.error.status !== 404) {
      return NextResponse.json({ error: preDetailResult.error.error }, { status: preDetailResult.error.status });
    }
    const preDetail = preDetailResult.ok ? preDetailResult.detail : null;

    // 4-0. 권한별 수정 제한 정책 (화면설계서 v1.1, 2026-03-30)
    // GENERAL 회원만 전체 필드 수정 가능. 그 외(STORE/SEKO/ADMIN)는 newsRcptYn 만 허용.
    // ※ 비밀번호는 별도 API(/reset-password) 로 처리되므로 본 PUT 스키마에 없음.
    if (userTp !== "GENERAL") {
      const restrictedFields = (
        [
          "userRole",
          "twoFactorEnabled",
          "loginNotification",
          "attributeChangeNotification",
          "status",
        ] as const
      ).filter((key) => result.data[key] !== undefined);
      if (restrictedFields.length > 0) {
        return NextResponse.json(
          {
            error:
              "一般会員以外はニュースレター受信設定のみ変更可能です",
            details: restrictedFields.map((field) => ({ field, message: "変更不可" })),
          },
          { status: 400 },
        );
      }
    }

    // 4-0-b. STORE + preDetail null 명시 거부
    // userListMng 에 storeLvl 미포함 → 탈퇴/삭제 STORE 의 authCd(1ST/2ND) 확정 불가.
    // QSP I/F 개선(userListMng 에 storeLvl 추가) 요청 중. 개선 전까지는 fail-closed 로 차단.
    if (userTp === "STORE" && !preDetail) {
      console.warn(
        "[PUT /api/admin/members/:id] 退会/削除済み販売店会員 수정 차단 — storeLvl 확보 불가",
        { targetRawId: maskEmail(rawId) },
      );
      return NextResponse.json(
        { error: "退会・削除済みの販売店会員は修正できません。先に会員復元が必要です" },
        { status: 400 },
      );
    }

    // 자기 자신 수정 가드 — self-lockout / self-escalation 방지
    // MF-4: 보호 대상을 status + userRole + twoFactorEnabled 로 확장한다.
    //       관리자가 본인 계정을 무력화(비활성/2FA off)하거나 권한을 마음대로
    //       조작할 수 없어야 한다.
    const modifiesSelfCritical =
      result.data.status !== undefined ||
      result.data.userRole !== undefined ||
      result.data.twoFactorEnabled !== undefined;
    if (modifiesSelfCritical) {
      if (preDetail) {
        // canonical ID 비교로 self-target 판정
        if (isSelfTarget(user.userId, preDetail)) {
          return NextResponse.json(
            { error: "自分自身のアカウントに対するこの変更は実行できません" },
            { status: 400 },
          );
        }
      } else {
        // preDetail null (F_NOT_USER — 탈퇴/삭제 회원) → rawId 기반 fallback 비교
        // 보안 강도 저하이나, 탈퇴 회원 상태 복구/변경을 위해 불가피
        console.warn("[PUT /api/admin/members/:id] preDetail null — rawId fallback self-target 비교:", {
          adminUserId: maskEmail(user.userId),
          targetRawId: maskEmail(rawId),
        });
        const adminLower = user.userId.trim().toLowerCase();
        const targetLower = rawId.trim().toLowerCase();
        if (adminLower === targetLower) {
          return NextResponse.json(
            { error: "自分自身のアカウントに対するこの変更は実行できません" },
            { status: 400 },
          );
        }
      }
    }

    // 4-a. userRole 변경은 일반회원에게만 허용 (사전 검증)
    // preDetail null (F_NOT_USER) 시 query param userTp로 fallback
    if (result.data.userRole !== undefined) {
      const effectiveUserTp = preDetail?.userTp ?? userTp;
      if (effectiveUserTp !== "GENERAL") {
        return NextResponse.json(
          { error: "ユーザー権限の変更は一般会員のみ可能です" },
          { status: 400 },
        );
      }
    }
    // [TOCTOU 완화 — MF-6] 본 검증과 아래 QSP 업데이트 사이에는 경합 창이 존재한다.
    // QSP 업데이트 API 에 `expectedUserTp=GENERAL` 같은 원자적 조건을 추가하는 것이
    // 근본 해결이며 QSP 측 변경이 필요하다(추후 작업 예정).
    // 그 전까지 본 핸들러는 업데이트 직후 QSP 를 재조회하여 사후 검증을 수행하고,
    // 불일치 발견 시 CRITICAL 로그를 남겨 사후 탐지 가능하도록 한다.

    // 5. QSP 회원정보 수정 API 호출
    // 필수 9개 필드: loginId, accsSiteCd, userTp, userId, secAuthYn, loginNotiYn, attrChgYn, newsRcptYn, statCd
    // 기존 값(preDetail)을 기본으로 채우고, 변경 요청 필드만 덮어쓰기
    // preDetail null (F_NOT_USER — 탈퇴/삭제 회원) 시 status 미지정이면 기본값 "D"로 완화
    // STORE 는 storeLvl 로 1ST/2ND 를 구분하지만 userListMng 에 storeLvl 미포함이라
    // preDetail null + STORE 는 위 4-0-b 에서 이미 차단됨. 여기서는 GENERAL/ADMIN/SEKO 만 처리.
    const fallbackAuthCd = preDetail ? null : defaultAuthCdFromUserTp(userTp);

    if (!preDetail) {
      const defaultedFields: string[] = [];
      if (result.data.twoFactorEnabled === undefined) defaultedFields.push("secAuthYn");
      if (result.data.loginNotification === undefined) defaultedFields.push("loginNotiYn");
      if (result.data.attributeChangeNotification === undefined) defaultedFields.push("attrChgYn");
      if (result.data.newsRcptYn === undefined) defaultedFields.push("newsRcptYn");
      if (result.data.userRole === undefined) defaultedFields.push("authCd");
      if (defaultedFields.length > 0) {
        console.warn("[PUT /api/admin/members/:id] preDetail 없음 — 기본값 적용 필드:", defaultedFields);
      }
    }
    const updatePayload: Record<string, unknown> = {
      loginId: user.userId,
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      userTp,
      userId: rawId,
      authCd: result.data.userRole ?? preDetail?.authCd ?? fallbackAuthCd,
      secAuthYn: result.data.twoFactorEnabled !== undefined
        ? (result.data.twoFactorEnabled ? "Y" : "N")
        : (preDetail?.secAuthYn ?? "N"),
      loginNotiYn: result.data.loginNotification !== undefined
        ? (result.data.loginNotification ? "Y" : "N")
        : (preDetail?.loginNotiYn ?? "N"),
      attrChgYn: result.data.attributeChangeNotification !== undefined
        ? (result.data.attributeChangeNotification ? "Y" : "N")
        : (preDetail?.attrChgYn ?? "N"),
      newsRcptYn: result.data.newsRcptYn ?? preDetail?.newsRcptYn ?? "N",
      statCd: result.data.status !== undefined
        ? STATUS_TO_STAT_CD[result.data.status]
        : (preDetail?.statCd ?? "D"),
      updBy: user.userId,
    };

    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        QSP_API.updateUserDtlMng,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify(updatePayload),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "updateUserDtlMng",
          callerRoute: "[PUT /api/admin/members/:id]",
          userId: maskEmail(user.userId),
          userType: "ADMIN",
        },
      );
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

    const resultCode = parsed.data.result.resultCode;
    const resultMsg = parsed.data.result.resultMsg;
    // QSP updateUserDtlMng: resultCode 기준으로만 성공 판정
    // "S"만 성공, 그 외(E 등)는 message 내용과 무관하게 실패
    if (resultCode !== "S") {
      const truncatedMsg = resultMsg.slice(0, QSP_LOG_MSG_MAX_LEN);
      console.error("[PUT /api/admin/members/:id] QSP 수정 실패:", {
        resultCode,
        resultMsg: truncatedMsg,
      });
      return NextResponse.json(
        { error: "会員情報の更新に失敗しました" },
        { status: 502 },
      );
    }

    // 4-b. MF-6 사후 검증: userRole 변경 경로에서만 동일 회원을 재조회하여
    //      사전 검증 이후 userTp 가 변하지 않았는지 확인한다. 롤백은 불가하지만
    //      CRITICAL 감사 로그로 탐지 가능하게 한다.
    let warning: string | undefined;
    if (result.data.userRole !== undefined) {
      const postDetailResult = await fetchQspUserDetail(rawId, userTp, "[PUT /api/admin/members/:id] POST-CHECK");
      if (!postDetailResult.ok) {
        console.error(
          "[PUT /api/admin/members/:id] TOCTOU 사후 검증 실패 — QSP 재조회 불가:",
          { byAdmin: user.userId },
        );
        warning = "更新は完了しましたが、事後検証ができませんでした";
      } else if (postDetailResult.detail.userTp !== "GENERAL") {
        console.error(
          "[PUT /api/admin/members/:id] CRITICAL: TOCTOU 감지 — 업데이트 후 userTp 가 GENERAL 이 아님",
          { postUserTp: postDetailResult.detail.userTp, byAdmin: user.userId },
        );
        warning = "更新は完了しましたが、対象会員の状態が想定と異なります。確認してください。";
      }
    }

    console.log("[PUT /api/admin/members/:id] 회원 정보 수정 완료");

    return NextResponse.json({
      data: {
        message: "会員情報を更新しました",
        ...(warning !== undefined && { warning }),
      },
    });
  } catch (error: unknown) {
    console.error("[PUT /api/admin/members/:id] 회원 정보 수정 실패:", error);
    return NextResponse.json(
      { error: "会員情報の更新に失敗しました" },
      { status: 500 },
    );
  }
}
