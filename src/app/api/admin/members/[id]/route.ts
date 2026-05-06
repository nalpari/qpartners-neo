import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { fetchQspUserDetail, parseQspDate, buildQspPreservedFields } from "@/lib/qsp-member";
import type { QspMemberDetail } from "@/lib/qsp-member";
import {
  memberIdParamSchema,
  memberUpdateSchema,
  qspUpdateResponseSchema,
  STATUS_TO_STAT_CD,
  lookupStatCd,
  normalizeAuthCdToUserRole,
  fallbackUserRoleFromUserTp,
} from "@/lib/schemas/member";
import { getUserTypeLabelMap } from "@/lib/user-type-labels";
import type { MemberUpdateInput } from "@/lib/schemas/member";
import { userTpSchema } from "@/lib/schemas/common";
import type { MemberDetail } from "@/components/admin/members/members-types";

type Params = { params: Promise<{ id: string }> };

const QSP_LOG_MSG_MAX_LEN = 200;

/**
 * QSP full-replace 회귀 감지 canary 샘플링 비율 (0~1).
 * preDetail 존재 경로에서 userRole 를 건드리지 않은 요청에 대해 이 비율만큼
 * postDetail 재조회 + 보존 필드 비교를 수행하여 QSP 가 "누락 필드 보존" 에서
 * "full-replace" 동작으로 회귀했는지 상시 탐지한다. 모니터링은 CRITICAL 로그로.
 * 기본 0.01(1%) — 부하와 탐지 속도의 트레이드오프.
 */
const QSP_SHADOW_CHECK_RATIO = (() => {
  const raw = process.env.QSP_SHADOW_CHECK_RATIO;
  if (raw === undefined) return 0.01;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0.01;
  return parsed;
})();

/**
 * QSP full-replace 회귀 감지용 보존 필드 비교.
 * PII 값은 로그에 싣지 않고 불일치 필드명만 반환한다.
 */
const SHADOW_COMPARE_FIELDS = [
  "userNm",
  "userNmKana",
  "user1stNm",
  "user2ndNm",
  "user1stNmKana",
  "user2ndNmKana",
  "email",
  "compNm",
  "compNmKana",
  "compPostCd",
  "compAddr",
  "compAddr2",
  "compTelNo",
  "compFaxNo",
  "deptNm",
  "pstnNm",
] as const satisfies ReadonlyArray<keyof QspMemberDetail>;

function diffPreservedFields(
  pre: QspMemberDetail,
  post: QspMemberDetail,
): string[] {
  const mismatches: string[] = [];
  for (const key of SHADOW_COMPARE_FIELDS) {
    // QSP 가 null 을 "" 로 정규화하는 경우와 실제 파괴(값→null) 를 구분:
    // null↔"" 는 변동으로 취급하지 않음 (보존 필드 canonicalization 차이).
    const preVal = pre[key] ?? "";
    const postVal = post[key] ?? "";
    if (preVal !== postVal) mismatches.push(key);
  }
  return mismatches;
}

/**
 * 4-0: GENERAL 외 회원(STORE/SEKO/ADMIN)이 수정 가능한 필드 화이트리스트.
 *
 * 정책 (화면설계서, 2026-04-28 갱신):
 *   · newsRcptYn / twoFactorEnabled / attributeChangeNotification / loginNotification — 전 회원 유형 대상
 *   · userRole / status — GENERAL 전용 (본 핸들러 정책)
 *
 * 블랙리스트가 아닌 화이트리스트로 유지하는 이유:
 *   memberUpdateSchema 에 새 필드가 추가될 때 자동으로 "허용"되는 fail-open 위험
 *   을 방지하기 위함(신규 필드는 여기에 명시적으로 추가해야만 허용됨).
 */
const ALLOWED_NON_GENERAL_FIELDS: ReadonlySet<keyof MemberUpdateInput> = new Set([
  "newsRcptYn",
  "twoFactorEnabled",
  "attributeChangeNotification",
  "loginNotification",
]);

/**
 * QSP userDetail 응답을 TO-BE MemberDetail 응답 shape 로 매핑.
 * GET / PUT 양쪽에서 동일 매핑을 사용해 DRY 유지.
 * 반환타입을 MemberDetail 로 명시 — 필드 drift 발생 시 컴파일 시점 탐지.
 * (openapi MemberDetail 스키마와도 필드 정렬 유지 필수)
 *
 * userTypeLabelMap 은 코드관리(USER_TYPE) 디테일 기반 — 운영자가 codeName 을 변경하면
 * 즉시 회원 상세 응답 라벨에 반영. 호출측에서 `await getUserTypeLabelMap()` 으로 주입한다.
 */
function mapQspDetailToResponse(
  d: QspMemberDetail,
  id: string,
  userTypeLabelMap: Map<string, string>,
): MemberDetail {
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
    userType: (d.userTp ? userTypeLabelMap.get(d.userTp) : undefined) ?? "unknown",
    // authCd 누락 회원(QSP 응답 결손) 은 userTp + storeLvl 기반으로 폴백 — display 한정.
    // 권한 결정 경로는 JWT/QSP 직접 값을 사용하므로 본 폴백은 영향 없음 (member.ts 주석 참조).
    userRole:
      normalizeAuthCdToUserRole(d.authCd) ||
      fallbackUserRoleFromUserTp(d.userTp, d.storeLvl),
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
    // 회원관리 상세 신규 표시 필드 (QSP 2026-04-24 확장).
    // 최근 접속일 · 탈퇴일시 · 탈퇴사유 — 탈퇴 회원은 resignDt/Remark 가 채워지고 그 외는 null.
    lastLoginAt: parseQspDate(d.loginDt),
    withdrawnAt: parseQspDate(d.resignDt),
    withdrawReason: d.resignRemark ?? null,
    notFoundInQsp: false,
  };
}

// GET /api/admin/members/:id — 회원 상세정보
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인 — MEMBERS.read 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_MEMBER", "read");
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
          // 신규 확장 필드 — F_NOT_USER 경로에서도 null 기본값으로 일관된 shape 반환.
          lastLoginAt: null,
          withdrawnAt: null,
          withdrawReason: null,
          notFoundInQsp: true,
        },
      });
    }

    // 4. 응답 매핑 (QSP → TO-BE)
    const userTypeLabelMap = await getUserTypeLabelMap();
    const mapped = mapQspDetailToResponse(detailResult.detail, idResult.data, userTypeLabelMap);

    console.log("[GET /api/admin/members/:id] 회원 상세 조회 완료");

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    logError("GET /api/admin/members/:id", error);
    return NextResponse.json(
      { error: "会員情報の取得に失敗しました" },
      { status: 500 },
    );
  }
}

// PUT /api/admin/members/:id — 회원 상세정보 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    // 1. 관리자 권한 확인 — MEMBERS.update 매트릭스 기반
    const authResult = await requireMenuPermission(request.headers, "ADM_MEMBER", "update");
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

    // userRole 동적 검증 — 권한관리(qp_roles) 테이블 기반 (Redmine #2178).
    // SUPER_ADMIN/ADMIN 은 일반회원에게 부여 불가, 비활성(isActive=false) 도 차단.
    // 부여 불가 권한(예: SEKO 정책)은 권한관리 화면에서 사용여부=N 으로 운영자가 제어.
    if (result.data.userRole !== undefined) {
      const roleCode = result.data.userRole;
      if (roleCode === "SUPER_ADMIN" || roleCode === "ADMIN") {
        return NextResponse.json(
          {
            error: "この権限はユーザーに付与できません",
            details: [{ field: "userRole", message: "SUPER_ADMIN/ADMIN 付与不可" }],
          },
          { status: 400 },
        );
      }
      const role = await prisma.qpRole.findUnique({
        where: { roleCode },
        select: { isActive: true },
      });
      if (!role || !role.isActive) {
        return NextResponse.json(
          {
            error: "指定された権限は存在しないか無効です",
            details: [{ field: "userRole", message: "存在しない/無効な権限コード" }],
          },
          { status: 400 },
        );
      }
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

    // 4-0. 권한별 수정 제한 정책 (화면설계서, 2026-04-28 갱신)
    // GENERAL 회원만 전체 필드 수정 가능. 그 외(STORE/SEKO/ADMIN)는
    //   newsRcptYn / twoFactorEnabled / attributeChangeNotification / loginNotification 만 허용.
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
              "一般会員以外はニュースレター・二次認証・属性変更通知・ログイン通知のみ変更可能です",
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
    // canonical userTp 확인 불가 상태에서 권한(authCd)/2FA 를 자유롭게 바꾸면
    // 권한 상승 / 2FA 무력화 위험이 있으므로 기본은 fail-closed.
    //
    // 단, status: "active" (복구) 경로는 **userRole + twoFactorEnabled 을 명시 필수**로 허용한다:
    //   - QSP 내부에 삭제 회원의 과거 값(authCd/secAuthYn) 이 남아있을 수 있으므로,
    //     복구 시 명시하지 않으면 고권한 또는 과거 2FA 상태가 silent 부활할 위험.
    //   - 관리자가 권한/2FA 를 명시 확정한 경우에만 복구 진행하도록 강제.
    //   - QSP updateUserDtlMng 도 secAuthYn 을 필수로 요구하는 제약이 있어
    //     구조적으로도 2FA 명시가 불가피 (실측 2026-04-21).
    if (!preDetail) {
      const isRestoringToActive = result.data.status === "active";
      const blockedCriticalFields: string[] = [];

      if (isRestoringToActive) {
        // 복구 경로: userRole + twoFactorEnabled 둘 다 필수.
        // `result.data.userRole` 은 위 동적 DB 검증을 이미 통과했으므로 활성 + SUPER_ADMIN/ADMIN
        // 외 권한 코드 — `undefined` 또는 검증 통과한 문자열만 도달.
        const missingRequired: string[] = [];
        if (result.data.userRole === undefined) missingRequired.push("userRole");
        if (result.data.twoFactorEnabled === undefined) missingRequired.push("twoFactorEnabled");
        if (missingRequired.length > 0) {
          console.warn(
            "[PUT /api/admin/members/:id] 復元経路 — 必須フィールド미명시 차단:",
            { targetRawId: maskEmail(rawId), missingRequired },
          );
          return NextResponse.json(
            {
              error:
                "復元時は権限(userRole)と二段階認証(twoFactorEnabled)を明示的に指定してください。QSP に残存する過去の値が復活する可能性があります",
              details: missingRequired.map((field) => ({ field, message: "復元時必須" })),
            },
            { status: 400 },
          );
        }
      } else {
        // 비복구 경로(status 미변경 또는 deleted 전환): 권한/2FA 변경 차단
        if (result.data.userRole !== undefined) blockedCriticalFields.push("userRole");
        if (result.data.twoFactorEnabled !== undefined) blockedCriticalFields.push("twoFactorEnabled");
      }

      if (blockedCriticalFields.length > 0) {
        console.warn(
          "[PUT /api/admin/members/:id] preDetail null — critical 변경 차단 (복구 경로에서만 userRole/2FA 명시 허용):",
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

    // self-edit 가드 해제 — ADMIN/SUPER_ADMIN 은 본인 포함 모든 사용자 정보 수정 허용
    // (정책: 관리자 영역 fail-open / full CRUD).
    // 단 self-lockout 회복 불능 케이스만 차단:
    //   - 본인 status 를 deleted/withdrawn 으로 전환 시 자기 자신을 시스템에서 제외하는 결과가 되어
    //     이후 본인이 어떠한 관리자 행위도 못 함. SUPER_ADMIN 1명만 있는 운영 환경에서 시스템 lockout.
    //   - 본인이 본인 권한을 GENERAL 등 일반회원으로 강등시키는 케이스도 동일.
    if (preDetail) {
      const isSelf = user.userId.trim().toLowerCase() === preDetail.userId.trim().toLowerCase();
      if (isSelf) {
        // memberUpdateSchema.status 는 WRITABLE_STATUSES = ["active", "deleted"] — withdrawn 은 PUT 미허용
        if (result.data.status === "deleted") {
          return NextResponse.json(
            { error: "自分自身のアカウントを削除状態に変更することはできません" },
            { status: 400 },
          );
        }
        if (result.data.userRole === "GENERAL") {
          return NextResponse.json(
            { error: "自分自身のアカウントを一般会員に降格することはできません" },
            { status: 400 },
          );
        }
      }
    }

    // 4-a. userRole 변경은 일반회원에게만 허용 (사전 검증)
    // preDetail null + userRole 경로는 4-0-c 에서 **복구(status: "active")** 한정으로 허용됨.
    //   복구 경로는 상단 disallowedFields 가드(L254)에서 userTp !== GENERAL 일 경우
    //   status 변경을 이미 차단하므로 여기 도달 시 userTp 는 GENERAL 확정.
    // preDetail 존재 시엔 canonical userTp 로 검증한다.
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
    // QSP updateUserDtlMng 는 전송한 필드만 갱신하고 누락 필드는 기존 값을 보존한다
    // (실측: id 54 → id 55/56 로그 대조, 2026-04-21 확인).
    // 과거 "full-replace 로 추정" 에 기반한 fallback "N" 강제 주입·warnings 통보 로직은
    // 실제로는 mutable 필드를 의도치 않게 Y→N 으로 덮어쓰는 데이터 파괴 원인이었으므로 제거.
    //
    // 동작:
    //   - preDetail 존재 → preservedFields(성명/회사/주소 등)를 현재값으로 재전송.
    //     mutable 은 "request 명시 → preDetail 값(단, null 이면 키 omit)" 순으로 처리.
    //     preDetail.X === null 인 필드에 `?? "N"` 으로 기본값을 박아넣으면 과거 버그 재현(Y→N 파괴)
    //     이 되므로, null 시 payload 에서 키 자체를 omit 해 QSP 의 "누락 필드 보존" 특성을 그대로 활용.
    //   - preDetail null (F_NOT_USER — 삭제(D) 회원 등) → request 로 명시된 mutable 필드만 전송.
    //     누락 필드는 QSP 기존값 유지.
    // STORE + preDetail null 은 4-0-b 에서, 2FA + preDetail null 은 4-0-c 에서 차단됨.
    // userRole + preDetail null 은 status=active 복구 경로 한정으로 허용 (4-0-c).
    const preservedFields = buildQspPreservedFields(preDetail);

    // 필드별 정책: string/enum → `??` + null 시 키 omit, boolean → `!== undefined` 로 false 처리 보장
    // (Zod 스키마에서 string/enum 은 빈 문자열을 enum 단계에서 차단하므로 `??` 안전)
    const mutablePayload: Record<string, unknown> = preDetail
      ? {
          // authCd (string/enum) — request 명시 → preDetail 값 → (null 이면 omit)
          ...(result.data.userRole !== undefined
            ? { authCd: result.data.userRole }
            : preDetail.authCd !== null
              ? { authCd: preDetail.authCd }
              : {}),
          // secAuthYn (enum "Y"|"N") — boolean 필드는 !== undefined 로 false 보존
          ...(result.data.twoFactorEnabled !== undefined
            ? { secAuthYn: result.data.twoFactorEnabled ? "Y" : "N" }
            : preDetail.secAuthYn !== null
              ? { secAuthYn: preDetail.secAuthYn }
              : {}),
          ...(result.data.loginNotification !== undefined
            ? { loginNotiYn: result.data.loginNotification ? "Y" : "N" }
            : preDetail.loginNotiYn !== null
              ? { loginNotiYn: preDetail.loginNotiYn }
              : {}),
          ...(result.data.attributeChangeNotification !== undefined
            ? { attrChgYn: result.data.attributeChangeNotification ? "Y" : "N" }
            : preDetail.attrChgYn !== null
              ? { attrChgYn: preDetail.attrChgYn }
              : {}),
          ...(result.data.newsRcptYn !== undefined
            ? { newsRcptYn: result.data.newsRcptYn }
            : preDetail.newsRcptYn !== null
              ? { newsRcptYn: preDetail.newsRcptYn }
              : {}),
          // statCd (enum) — request 명시 → preDetail 값 → (null 이면 omit)
          ...(result.data.status !== undefined
            ? { statCd: STATUS_TO_STAT_CD[result.data.status] }
            : preDetail.statCd !== null
              ? { statCd: preDetail.statCd }
              : {}),
        }
      : {
          // preDetail null — 명시된 필드만. QSP 가 누락 필드는 보존한다.
          ...(result.data.userRole !== undefined && { authCd: result.data.userRole }),
          ...(result.data.twoFactorEnabled !== undefined && {
            secAuthYn: result.data.twoFactorEnabled ? "Y" : "N",
          }),
          ...(result.data.loginNotification !== undefined && {
            loginNotiYn: result.data.loginNotification ? "Y" : "N",
          }),
          ...(result.data.attributeChangeNotification !== undefined && {
            attrChgYn: result.data.attributeChangeNotification ? "Y" : "N",
          }),
          ...(result.data.newsRcptYn !== undefined && { newsRcptYn: result.data.newsRcptYn }),
          ...(result.data.status !== undefined && {
            statCd: STATUS_TO_STAT_CD[result.data.status],
          }),
        };

    const updatePayload: Record<string, unknown> = {
      ...preservedFields,
      loginId: user.userId,
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
      userTp,
      userId: rawId,
      ...mutablePayload,
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

    // 4-b. MF-6 사후 검증 + QSP 회귀 감지 canary
    //   (1) userRole 변경 경로: 항상 재조회하여 사전 검증 이후 userTp 가 변하지
    //       않았는지 확인 (TOCTOU). 불일치 시 CRITICAL 감사 로그.
    //   (2) preDetail 존재 + userRole 미변경 경로: QSP_SHADOW_CHECK_RATIO 확률로
    //       재조회하여 preservedFields(성명/회사/주소 등 PII) 불일치 탐지.
    //       QSP 가 "누락 필드 보존" → "full-replace" 로 회귀할 경우 상시 탐지 가능.
    //   postDetail 은 응답 member snapshot 의 최신 소스로도 재사용된다.
    let warning: string | undefined;
    let postDetail: QspMemberDetail | null = null;
    let postDetailSource: "post-check" | "shadow-check" | null = null;

    if (result.data.userRole !== undefined) {
      const postDetailResult = await fetchQspUserDetail(rawId, userTp, "[PUT /api/admin/members/:id] POST-CHECK");
      postDetailSource = "post-check";
      if (!postDetailResult.ok) {
        console.error(
          "[PUT /api/admin/members/:id] TOCTOU 사후 검증 실패 — QSP 재조회 불가:",
          { byAdmin: maskEmail(user.userId) },
        );
        warning = "更新は完了しましたが、事後検証ができませんでした";
      } else {
        postDetail = postDetailResult.detail;
        if (postDetailResult.detail.userTp !== "GENERAL") {
          console.error(
            "[PUT /api/admin/members/:id] CRITICAL: TOCTOU 감지 — 업데이트 후 userTp 가 GENERAL 이 아님",
            { postUserTp: postDetailResult.detail.userTp, byAdmin: maskEmail(user.userId) },
          );
          warning = "更新は完了しましたが、対象会員の状態が想定と異なります。確認してください。";
        }
        // preservedFields 회귀도 함께 검사 (postDetail 이미 확보됨, 추가 호출 없음)
        if (preDetail) {
          const mismatches = diffPreservedFields(preDetail, postDetail);
          if (mismatches.length > 0) {
            console.error(
              "[PUT /api/admin/members/:id] CRITICAL: QSP full-replace regression — 보존 필드 불일치",
              {
                mismatches,
                byAdmin: maskEmail(user.userId),
                targetUserId: maskEmail(rawId),
                source: "post-check",
              },
            );
          }
        }
      }
    } else if (
      preDetail &&
      QSP_SHADOW_CHECK_RATIO > 0 &&
      Math.random() < QSP_SHADOW_CHECK_RATIO
    ) {
      const postDetailResult = await fetchQspUserDetail(
        rawId,
        userTp,
        "[PUT /api/admin/members/:id] SHADOW-CHECK",
      );
      postDetailSource = "shadow-check";
      if (postDetailResult.ok) {
        postDetail = postDetailResult.detail;
        const mismatches = diffPreservedFields(preDetail, postDetail);
        if (mismatches.length > 0) {
          console.error(
            "[PUT /api/admin/members/:id] CRITICAL: QSP full-replace regression — 보존 필드 불일치",
            {
              mismatches,
              byAdmin: maskEmail(user.userId),
              targetUserId: maskEmail(rawId),
              source: "shadow-check",
            },
          );
        }
      }
      // shadow-check 실패는 canary 의 best-effort 성격상 무시 (경고 없음)
    }

    // 삭제 회원 복구(preDetail null + status 변경) 경로 안내.
    // 운영자가 "사전 상태 미확보" 상태였음을 인지하도록 warning 단수 메시지 복원.
    // userRole TOCTOU 경고와는 경로가 상호배타적이므로 warning 단수로 충분.
    if (!preDetail && warning === undefined) {
      warning =
        "削除済み会員の更新です。事前の会員情報を取得できなかったため、保存後に一覧で内容をご確認ください。";
    }

    // 완료 로그: mutable 필드별 pre/request 대조 (PII 아닌 enum/boolean/statCd 만).
    // "Y→N 이 request 명시인지 QSP 회귀인지" 사후 감사에서 구분 가능하게 한다.
    // preDetail null 경로(복구 포함) 에서도 `pre: null` 고정으로 `req` 값을 기록해
    // 복구 경로의 감사 가치를 유지한다 (critical 액션이므로 로그 보존 중요).
    const mutableDiff: Record<string, { pre: unknown; req: unknown }> = {};
    if (result.data.userRole !== undefined) {
      mutableDiff.authCd = { pre: preDetail?.authCd ?? null, req: result.data.userRole };
    }
    if (result.data.twoFactorEnabled !== undefined) {
      mutableDiff.secAuthYn = {
        pre: preDetail?.secAuthYn ?? null,
        req: result.data.twoFactorEnabled ? "Y" : "N",
      };
    }
    if (result.data.loginNotification !== undefined) {
      mutableDiff.loginNotiYn = {
        pre: preDetail?.loginNotiYn ?? null,
        req: result.data.loginNotification ? "Y" : "N",
      };
    }
    if (result.data.attributeChangeNotification !== undefined) {
      mutableDiff.attrChgYn = {
        pre: preDetail?.attrChgYn ?? null,
        req: result.data.attributeChangeNotification ? "Y" : "N",
      };
    }
    if (result.data.newsRcptYn !== undefined) {
      mutableDiff.newsRcptYn = {
        pre: preDetail?.newsRcptYn ?? null,
        req: result.data.newsRcptYn,
      };
    }
    if (result.data.status !== undefined) {
      mutableDiff.statCd = {
        pre: preDetail?.statCd ?? null,
        req: STATUS_TO_STAT_CD[result.data.status],
      };
    }

    console.log("[PUT /api/admin/members/:id] 회원 정보 수정 완료", {
      targetUserId: maskEmail(rawId),
      targetUserTp: userTp,
      byAdmin: maskEmail(user.userId),
      changedFields: Object.keys(result.data),
      preDetailPresent: preDetail !== null,
      postDetailSource,
      mutableDiff: Object.keys(mutableDiff).length > 0 ? mutableDiff : null,
      warning: warning ?? null,
    });

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
    // 타입은 mapper 반환에 의존하는 구조가 아니라 "응답 계약" 에 의존하도록 MemberDetail 로
    // 직접 명시 — drift 시 컴파일 실패로 변경을 강제한다 (mapper 시그니처 변경만 따라가지 않음).
    let memberSnapshot: MemberDetail | undefined;
    const userTypeLabelMap = await getUserTypeLabelMap();
    if (postDetail) {
      memberSnapshot = mapQspDetailToResponse(postDetail, idResult.data, userTypeLabelMap);
    } else if (preDetail && !userRolePostCheckFailed) {
      const base = mapQspDetailToResponse(preDetail, idResult.data, userTypeLabelMap);
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
        // updatedAt / updatedBy 는 overlay 하지 않는다 — 권위 있는 값은 QSP 가 보유(uptDt/uptNm).
        // 클라이언트 시계 기반 new Date() 는 시계 스큐/정렬 불일치 및 "실제 저장 시각" 위조 위험이 있고,
        // user.userId(이메일) 를 updatedBy 에 넣으면 base 컨벤션(사람 이름, userNm 포맷) 위반 + PII 노출.
        // base(preDetail.uptDt/uptNm) 를 그대로 내려보내 직전 재조회 시점의 값을 유지하고,
        // 다음 GET 에서 QSP 가 반환하면 실제 최신값으로 자연 재동기화된다.
        // F_NOT_USER 경로(statCd="D"/"R") 에서는 재조회도 null 이므로, 이 overlay 에 최신시각을
        // 억지로 주입하는 것은 "데이터가 살아있다" 는 착시를 유발해 오히려 해롭다.
      };
    }

    return NextResponse.json({
      data: {
        message: "会員情報を更新しました",
        ...(memberSnapshot !== undefined && { member: memberSnapshot }),
        ...(warning !== undefined && { warning }),
      },
    });
  } catch (error: unknown) {
    logError("PUT /api/admin/members/:id", error);
    return NextResponse.json(
      { error: "会員情報の更新に失敗しました" },
      { status: 500 },
    );
  }
}
