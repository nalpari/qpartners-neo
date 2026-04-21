import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { fetchQspUserDetail, parseQspDate, buildQspPreservedFields } from "@/lib/qsp-member";
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
import type { MemberUpdateInput } from "@/lib/schemas/member";
import { userTpSchema } from "@/lib/schemas/common";

type Params = { params: Promise<{ id: string }> };

const QSP_LOG_MSG_MAX_LEN = 200;

/**
 * 4-0: GENERAL 외 회원(STORE/SEKO/ADMIN)이 수정 가능한 필드 화이트리스트.
 *      화면설계서 v1.1(2026-03-30) — 이들 회원은 ニュースレター受信設定만 변경 가능.
 *
 * 블랙리스트가 아닌 화이트리스트로 유지하는 이유:
 *   memberUpdateSchema 에 새 필드가 추가될 때 자동으로 "허용"되는 fail-open 위험
 *   을 방지하기 위함(신규 필드는 여기에 명시적으로 추가해야만 허용됨).
 */
const ALLOWED_NON_GENERAL_FIELDS: ReadonlySet<keyof MemberUpdateInput> = new Set([
  "newsRcptYn",
]);

/**
 * preDetail null 경로에서 QSP 필수 필드 제약으로 기본값이 강제 주입되는 필드의
 * 클라이언트 노출용 일본어 라벨. 내부 필드명(secAuthYn 등)이 응답에 새어나가지
 * 않도록 하기 위한 매핑.
 */
const DEFAULTED_FIELD_LABELS_JA: Record<string, string> = {
  secAuthYn: "二段階認証設定",
  loginNotiYn: "ログイン通知設定",
  attrChgYn: "属性変更通知設定",
  newsRcptYn: "ニュースレター受信設定",
  authCd: "ユーザー権限",
  statCd: "アカウント状態",
};

/**
 * 관리자가 대상 회원 자신인지 case-insensitive 로 판정.
 * MF-4: 단순 path rawId 비교 대신 QSP 의 canonical userId/loginId 를 사용해
 * 이메일 별칭·대소문자·공백 차이로 인한 self-guard 우회를 방지한다.
 */
function isSelfTarget(adminUserId: string, detail: QspMemberDetail): boolean {
  const admin = adminUserId.trim().toLowerCase();
  return detail.userId.trim().toLowerCase() === admin;
}

/**
 * QSP userDetail 응답을 TO-BE MemberDetail 응답 shape 로 매핑.
 * GET / PUT 양쪽에서 동일 매핑을 사용해 DRY 유지.
 * openapi MemberDetail 스키마와 필드 일치 필수.
 */
function mapQspDetailToResponse(d: QspMemberDetail, id: string) {
  return {
    id,
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
    // QSP regDt(YYYY.MM.DD) / uptDt(YYYY.MM.DD HH:mm:ss) 를 ISO 8601 (+09:00) 로 정규화.
    // 백엔드 timestamp 컨벤션과 통일 — 정렬·비교·dayjs 일관 처리.
    createdAt: parseQspDate(d.regDt),
    updatedAt: parseQspDate(d.uptDt),
    // uptNm 은 nullable — QSP null 시 그대로 노출 (userNm 형태, 프론트 호환성 우선).
    updatedBy: d.uptNm ?? null,
    notFoundInQsp: false,
  };
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
          // Timestamp 필드는 의미상 null 이 정확 — "값 없음" ≠ "빈 시각".
          // openapi 도 nullable: true 로 동기화. 다른 string 필드는 기존 컨벤션 유지(빈 문자열).
          createdAt: null,
          updatedAt: null,
          updatedBy: null,
          notFoundInQsp: true,
        },
      });
    }

    // 4. 응답 매핑 (QSP → TO-BE)
    const mapped = mapQspDetailToResponse(detailResult.detail, idResult.data);

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
    //
    // 화이트리스트(ALLOWED_NON_GENERAL_FIELDS) 기반 fail-closed 검증:
    //   스키마에 새 필드가 추가되어도 화이트리스트에 올리지 않으면 자동 차단된다.
    if (userTp !== "GENERAL") {
      const disallowedFields = (Object.keys(result.data) as Array<keyof MemberUpdateInput>)
        .filter((key) => result.data[key] !== undefined)
        .filter((key) => !ALLOWED_NON_GENERAL_FIELDS.has(key));
      if (disallowedFields.length > 0) {
        return NextResponse.json(
          {
            error:
              "一般会員以外はニュースレター受信設定のみ変更可能です",
            details: disallowedFields.map((field) => ({ field, message: "変更不可" })),
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
        if (adminNorm === targetNorm) {
          // matched 케이스만 감사 로그 출력 (불일치는 정상 경로 — 노이즈 방지)
          console.warn("[PUT /api/admin/members/:id] preDetail null — NFKC 정규화 rawId fallback 매칭(self-target 차단):", {
            adminUserId: maskEmail(user.userId),
            targetRawId: maskEmail(rawId),
          });
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
    //
    // QSP updateUserDtlMng 는 full-replace 방식(전송하지 않은 필드를 null 로 덮어씀, 2026-04-20 확인 / Design §1.4).
    // 성명·회사·주소 등 mutable 스키마에 없는 필드가 null 로 날아가는 사고를 막기 위해
    // preDetail 의 보존 필드를 페이로드 기본값으로 깔고, mutable 필드
    // (authCd / secAuthYn / loginNotiYn / attrChgYn / newsRcptYn / statCd — memberUpdateSchema 매핑 대상)만
    // request body 로 덮어쓴다.
    //
    // preDetail null (F_NOT_USER — 탈퇴/삭제 회원) 시 보존할 값이 없으므로
    // mutable 필드 + 필수 메타만 전송하고, 누락 필드는 fallback 기본값으로 통보한다.
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

    // preDetail 존재 시 보존할 비-mutable 필드 (성명/회사/주소/조직 정보).
    // QSP full-replace 방어 — 전송 안 하면 null 로 덮어써짐.
    // 키 목록·타입·조립 로직은 qsp-member.ts 의 QSP_PRESERVED_KEYS / buildQspPreservedFields 에서 관리.
    const preservedFields = buildQspPreservedFields(preDetail);

    const updatePayload: Record<string, unknown> = {
      ...preservedFields,
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
    //      postDetail 은 응답 member snapshot 의 최신 소스로도 재사용된다.
    let warning: string | undefined;
    let postDetail: QspMemberDetail | null = null;
    if (result.data.userRole !== undefined) {
      const postDetailResult = await fetchQspUserDetail(rawId, userTp, "[PUT /api/admin/members/:id] POST-CHECK");
      if (!postDetailResult.ok) {
        console.error(
          "[PUT /api/admin/members/:id] TOCTOU 사후 검증 실패 — QSP 재조회 불가:",
          { byAdmin: user.userId },
        );
        warning = "更新は完了しましたが、事後検証ができませんでした";
      } else {
        postDetail = postDetailResult.detail;
        if (postDetailResult.detail.userTp !== "GENERAL") {
          console.error(
            "[PUT /api/admin/members/:id] CRITICAL: TOCTOU 감지 — 업데이트 후 userTp 가 GENERAL 이 아님",
            { postUserTp: postDetailResult.detail.userTp, byAdmin: user.userId },
          );
          warning = "更新は完了しましたが、対象会員の状態が想定と異なります。確認してください。";
        }
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

    // QSP 내부 필드명이 클라이언트 응답에 노출되지 않도록 일본어 라벨로 치환.
    // 매핑에 없는 키(신규 필드 추가 누락 등)는 방어적으로 원시 키로 폴백.
    const warnings =
      defaultedFields.length > 0
        ? defaultedFields.map((f) => {
            const label = DEFAULTED_FIELD_LABELS_JA[f] ?? f;
            return `${label}が既定値で更新されました (元の値を取得できなかったため)`;
          })
        : undefined;

    // 응답용 member snapshot — 저장 직후 팝업 재조회가 QSP F_NOT_USER 로
    // 빈 값이 되는 문제를 방지 (삭제 상태 전환 케이스).
    // 우선순위: postDetail(userRole 변경 경로 재조회) → preDetail + 변경 필드 overlay.
    // preDetail null 경로는 snapshot 생략 → 프론트는 기존 fallback(재조회) 로 처리.
    //
    // [보안 가드] userRole 변경 경로에서 postDetail 확보에 실패한 경우(TOCTOU 사후 검증
    // 불가) snapshot 을 생략해 프론트가 강제 재조회하도록 한다. preDetail overlay 로
    // 내려보내면 검증되지 않은 권한 변경이 캐시에 "성공" 으로 남아 운영자가 오인할
    // 위험이 있으므로 명시적으로 차단.
    const userRolePostCheckFailed =
      result.data.userRole !== undefined && !postDetail;
    let memberSnapshot: ReturnType<typeof mapQspDetailToResponse> | undefined;
    if (postDetail) {
      memberSnapshot = mapQspDetailToResponse(postDetail, idResult.data);
    } else if (preDetail && !userRolePostCheckFailed) {
      const base = mapQspDetailToResponse(preDetail, idResult.data);
      memberSnapshot = {
        ...base,
        ...(result.data.userRole !== undefined && { userRole: result.data.userRole }),
        ...(result.data.twoFactorEnabled !== undefined && {
          twoFactorEnabled: result.data.twoFactorEnabled,
        }),
        ...(result.data.loginNotification !== undefined && {
          loginNotification: result.data.loginNotification,
        }),
        ...(result.data.attributeChangeNotification !== undefined && {
          attributeChangeNotification: result.data.attributeChangeNotification,
        }),
        ...(result.data.newsRcptYn !== undefined && { newsRcptYn: result.data.newsRcptYn }),
        ...(result.data.status !== undefined && { status: result.data.status }),
        // 방금 저장 시점으로 updatedAt 교체 — 프론트 "갱신일" 즉시 반영.
        // 다음 GET 에서 QSP 가 대상을 반환하면 실제 uptDt 로 재동기화되지만,
        // F_NOT_USER 경로(statCd="D"/"R" 회원)에서는 updatedAt 이 null 로 돌아올 수 있음.
        updatedAt: new Date().toISOString(),
        updatedBy: user.userId,
      };
    }

    return NextResponse.json({
      data: {
        message: "会員情報を更新しました",
        ...(memberSnapshot !== undefined && { member: memberSnapshot }),
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
