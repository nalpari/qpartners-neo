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
    // QSP userDetail 이 F_NOT_USER 반환 → preDetail.storeLvl 확보 불가.
    // 상위 userListMng 응답에도 storeLvl 미포함으로 query param 대체 불가.
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

    // 4-0-c. preDetail null (F_NOT_USER — 탈퇴/삭제 회원) 시 critical 변경 제한
    // userRole/twoFactorEnabled 는 canonical userTp 확인 불가 상태에서 바꾸면
    // 권한 상승 / 2FA 무력화 위험이 있으므로 fail-closed. status(복구) 만 허용.
    // 회원 복구 완료 후 재요청하면 preDetail 이 확보되므로 정상 경로로 처리됨.
    if (!preDetail) {
      const blockedCriticalFields: string[] = [];
      if (result.data.userRole !== undefined) blockedCriticalFields.push("userRole");
      if (result.data.twoFactorEnabled !== undefined) blockedCriticalFields.push("twoFactorEnabled");
      if (blockedCriticalFields.length > 0) {
        console.warn(
          "[PUT /api/admin/members/:id] preDetail null — critical 변경 차단 (권한/2FA 는 복구 후 재요청):",
          { targetRawId: maskEmail(rawId), blockedCriticalFields },
        );
        return NextResponse.json(
          {
            error:
              "退会・削除済み会員の権限・二段階認証は変更できません。先にステータスを復元してください",
            details: blockedCriticalFields.map((field) => ({ field, message: "復元後に変更可能" })),
          },
          { status: 400 },
        );
      }
    }

    // 자기 자신 수정 가드 — self-lockout / self-escalation 방지
    // MF-4: 보호 대상을 status + userRole + twoFactorEnabled 로 확장한다.
    //       관리자가 본인 계정을 무력화(비활성/2FA off)하거나 권한을 마음대로
    //       조작할 수 없어야 한다.
    // preDetail null 경로는 4-0-c 에서 userRole/2FA 가 이미 차단되므로,
    // 여기서는 status 변경에 한해 rawId 기반 fallback 자기 비교만 수행한다.
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
        // preDetail null (F_NOT_USER): NFKC 정규화 후 rawId fallback 비교
        // - 전각/반각, 한글 조합, invisible char(ZWSP 등) 우회 차단
        // - 대소문자·좌우 공백 무시
        // - 도달 가능한 케이스는 status 변경(복구) 에 한정됨 (4-0-c)
        const normalize = (s: string) =>
          s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
        const adminNorm = normalize(user.userId);
        const targetNorm = normalize(rawId);
        console.warn("[PUT /api/admin/members/:id] preDetail null — NFKC 정규화 rawId fallback self-target 비교:", {
          adminUserId: maskEmail(user.userId),
          targetRawId: maskEmail(rawId),
          matched: adminNorm === targetNorm,
        });
        if (adminNorm === targetNorm) {
          return NextResponse.json(
            { error: "自分自身のアカウントに対するこの変更は実行できません" },
            { status: 400 },
          );
        }
      }
    }

    // 4-a. userRole 변경은 일반회원에게만 허용 (사전 검증)
    // preDetail null 경로는 이미 4-0-c 에서 차단됨 → 여기 도달 시 preDetail 존재 확정
    if (result.data.userRole !== undefined) {
      if (preDetail && preDetail.userTp !== "GENERAL") {
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

    // preDetail null 시 fallback 기본값이 주입된 필드 목록을 수집하여
    // 응답 `warnings` 로 클라이언트에 통보한다 (사일런트 상태 변경 방지).
    // 4-0-c 에 의해 userRole/twoFactorEnabled 변경 요청 자체는 차단되지만,
    // QSP 필수 필드 제약으로 secAuthYn 등은 "N" 이 강제 주입되므로 통보 대상.
    const defaultedFields: string[] = [];
    if (!preDetail) {
      if (result.data.twoFactorEnabled === undefined) defaultedFields.push("secAuthYn");
      if (result.data.loginNotification === undefined) defaultedFields.push("loginNotiYn");
      if (result.data.attributeChangeNotification === undefined) defaultedFields.push("attrChgYn");
      if (result.data.newsRcptYn === undefined) defaultedFields.push("newsRcptYn");
      if (result.data.userRole === undefined) defaultedFields.push("authCd");
      if (result.data.status === undefined) defaultedFields.push("statCd");
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

    console.log("[PUT /api/admin/members/:id] 회원 정보 수정 완료", {
      targetUserId: maskEmail(rawId),
      targetUserTp: userTp,
      byAdmin: maskEmail(user.userId),
      changedFields: Object.keys(result.data),
      preDetailPresent: preDetail !== null,
      defaultedFields,
      warning: warning ?? null,
    });

    const warnings =
      defaultedFields.length > 0
        ? defaultedFields.map(
            (f) => `${f} が既定値で更新されました (元の値を取得できなかったため)`,
          )
        : undefined;

    return NextResponse.json({
      data: {
        message: "会員情報を更新しました",
        ...(warning !== undefined && { warning }),
        ...(warnings !== undefined && { warnings }),
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
