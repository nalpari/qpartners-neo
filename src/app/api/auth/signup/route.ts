import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserFromHeaders, isInternalUser } from "@/lib/auth";
import {
  signupRequestSchema,
  qspResponseSchema,
} from "@/lib/schemas/signup";
import { sendMail } from "@/lib/mailer";
import {
  signupCompleteMailHtml,
  SIGNUP_COMPLETE_SUBJECT,
} from "@/lib/mail-templates/signup-complete";
import { QSP_API, SITE_URL } from "@/lib/config";
import { fetchWithLog, maskEmail, maskUserId } from "@/lib/interface-logger";

// POST /api/auth/signup — 일반회원 등록 (QSP newUserReq 프록시 + 승인완료 메일)
//
// 셀프 회원가입 폐지 — SUPER_ADMIN·ADMIN 이 회원관리 화면에서 대리 등록하는 전용 경로.
// middleware PUBLIC_PATHS 에서 제외되어 있어 미인증 요청은 여기 도달 전 401 로 차단되며,
// 본 핸들러의 isInternalUser 가드는 일반 로그인 사용자(GENERAL/STORE/SEKO)의 호출을 막는다.
//
// 가드로 requireMenuPermission("ADM_MEMBER", "create") 대신 isInternalUser 를 쓰는 이유:
// 회원등록은 운영자가 권한관리 화면에서 켜고 끄는 메뉴 역량이 아니라, 사용자 유형(사내 관리자)
// 자체가 통과 조건인 관문이기 때문이다. 상세는 `auth.ts#isInternalUser` 의 예외 조항 참조.
export async function POST(request: NextRequest) {
  try {
    // 0. 권한 가드 — 사내 사용자(SUPER_ADMIN | ADMIN) 전용
    const actor = getUserFromHeaders(request.headers);
    if (!actor) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    if (!isInternalUser(actor.role)) {
      console.warn(
        "[POST /api/auth/signup] 권한 거부 — 사내 사용자 아님, role:",
        actor.role,
      );
      return NextResponse.json(
        { error: "権限がありません" },
        { status: 403 },
      );
    }

    // 1. Request body 파싱 + Zod 검증
    let body: unknown;
    try {
      body = await request.json();
    } catch (error: unknown) {
      console.warn("[POST /api/auth/signup] JSON parse 실패:", error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = signupRequestSchema.safeParse(body);
    if (!result.success) {
      // M1: Zod 내부 구조 노출 방지 — 필드명+메시지만 반환
      const fields = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      // 필드명만 로깅 — 입력값(PII) 은 제외. 서버 로그만으로 400 의 원인이
      // Zod 검증인지 QSP 등록 실패인지 구분 가능하게 한다.
      console.warn(
        "[POST /api/auth/signup] Zod 검증 실패 — 필드:",
        fields.map((f) => f.field).join(", "),
      );
      return NextResponse.json(
        { error: "Validation failed", fields },
        { status: 400 },
      );
    }

    const {
      email: rawEmail,
      pwd,
      user1stNm,
      user2ndNm,
      user1stNmKana,
      user2ndNmKana,
      compNm,
      compNmKana,
      compPostCd,
      compAddr,
      compAddr2,
      compTelNo,
      compFaxNo,
      deptNm,
      pstnNm,
      newsRcptYn,
    } = result.data;

    // /auth/email/check 는 정규화된 키(trim+lowercase)로 QSP 조회한다.
    // 본 핸들러도 동일 baseline 으로 정규화해 두 라우트 결과 불일치(대소문자 변형 중복회원)를 차단.
    const email = rawEmail.trim().toLowerCase();

    // 감사 컨텍스트 — 성공/실패 양쪽 로그에서 공유한다.
    // 아래 QSP 호출 이후의 4개 502 출구는 모두 "쓰기 성립 여부 불명" 구간이다:
    // 타임아웃(AbortSignal 10s)이 QSP 커밋 직전에 터지거나, 커밋 후 응답만 깨질 수 있다.
    // 계정은 실제로 생성됐는데 클라이언트에는 실패로 보이면, 관리자가 재시도 → 409(중복) 를
    // 보고 "남의 주소" 로 오해해 포기하기 쉽다. 이 경우 계정은 살아있고 생성자 기록만 없어진다.
    // 따라서 해당 출구들에도 성공 로그와 동일한 target/actor 를 남겨 수동 확인이 가능하게 한다.
    // `stage` 는 어느 지점에서 끊겼는지 = 커밋 가능성이 얼마나 높은지를 구분하는 단서다.
    const auditCtx = {
      targetUserId: maskEmail(email),
      byAdmin: maskUserId(actor.userId),
    };

    // 2. QSP newUserReq I/F 호출
    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        QSP_API.newUserReq,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          // M4: 10초 타임아웃
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            userTp: "GENERAL",
            userId: email,
            accsSiteCd: "QPARTNERS",
            joinSourceCd: "QPARTNERS",
            pwd,
            user1stNm,
            user2ndNm,
            user1stNmKana,
            user2ndNmKana,
            email,
            deptNm,
            pstnNm,
            compNm,
            compNmKana,
            compPostCd,
            compAddr,
            compAddr2,
            compTelNo,
            compFaxNo,
            newsRcptYn,
            authCd: "NORMAL",
          }),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "newUserReq",
          callerRoute: "[POST /api/auth/signup]",
          // 대리 등록이므로 인터페이스 로그는 생성 대상이 아니라 **행위자(관리자)** 에게 귀속시킨다.
          // `[PUT /api/admin/members/:id]` 의 updateUserDtlMng 호출과 동일 관례.
          // 생성 대상은 requestBody 의 email 키에 남으므로 추적 가능하다.
          //
          // maskEmail 이 아니라 maskUserId 를 쓰는 이유: 관리자 계정은 이메일이 아니라 로그인 ID
          // (예: "1301011") 로 인증한다. maskEmail 은 "@" 가 없으면 원문을 그대로 반환하므로
          // 관리자 ID 가 평문으로 DB(qp_interface_log.user_id) 에 적재된다.
          // (logout/password-init/deptList 라우트가 동일 이유로 maskUserId 를 사용)
          userId: maskUserId(actor.userId),
          userType: actor.userType,
        },
      );
    } catch (error: unknown) {
      console.error(
        "[POST /api/auth/signup] QSP API 호출 실패 — 등록 성립 여부 불명(수동 확인 필요)",
        { ...auditCtx, stage: "transport", error },
      );
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    // I6: QSP HTTP 비정상 응답 처리
    if (!qspResponse.ok) {
      console.error(
        "[POST /api/auth/signup] QSP 비정상 응답 — 등록 성립 여부 불명(수동 확인 필요)",
        { ...auditCtx, stage: "http-status", status: qspResponse.status },
      );
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    // 3. QSP 응답 파싱
    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error: unknown) {
      console.error(
        "[POST /api/auth/signup] QSP 응답 JSON 파싱 실패 — 등록 성립 여부 불명(수동 확인 필요)",
        { ...auditCtx, stage: "response-parse", error },
      );
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error(
        "[POST /api/auth/signup] QSP 응답 스키마 불일치 — 등록 성립 여부 불명(수동 확인 필요)",
        { ...auditCtx, stage: "response-schema", issues: parsed.error.issues },
      );
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    const qsp = parsed.data;

    // 4. 성공/실패 판별
    if (qsp.result.resultCode !== "S") {
      const msg = qsp.result.resultMsg;
      console.error("[POST /api/auth/signup] QSP 등록 실패:", msg, auditCtx);

      // 이메일 중복 판별: QSP 메시지에 "既に" (이미) 포함 시 409 Conflict
      const isDuplicate = msg?.includes("既に") || msg?.includes("すでに") || msg?.includes("already");
      // QSP 에러 메시지를 클라이언트에 직접 노출하지 않음 (내부 정보 유출 방지)
      return NextResponse.json(
        { error: isDuplicate ? "すでに使用されているメールアドレスです" : "会員登録に失敗しました" },
        { status: isDuplicate ? 409 : 400 },
      );
    }

    // 5. 승인완료 메일 발송 — QSP 등록 후이므로 메일 실패해도 200 유지하되,
    //    응답의 mailDelivery 필드로 클라이언트에 안내 표시 (UI 안내 누락 방지).
    const userName = `${user2ndNm}${user1stNm}`;
    let mailDelivery: "sent" | "failed" = "sent";
    try {
      await sendMail({
        to: email,
        subject: SIGNUP_COMPLETE_SUBJECT,
        html: signupCompleteMailHtml({
          userNm: userName,
          email,
          siteUrl: SITE_URL,
        }),
      });
    } catch (error) {
      mailDelivery = "failed";
      console.error(
        "[POST /api/auth/signup] 승인완료 메일 발송 실패 — QSP 등록은 완료, UI 안내 필요",
        error instanceof Error ? { message: error.message } : String(error),
      );
    }

    // 6. 감사 로그 — 대리 등록은 "누가 이 계정을 만들었나" 가 사후 추궁 대상이 되는 조작이다.
    //    QSP 로 보내는 payload 에는 행위자 식별자가 없으므로(accsSiteCd/joinSourceCd 는 사이트 코드일 뿐)
    //    QSP 측 기록만으로는 행위자를 특정할 수 없다. 추적은 두 경로로 이중화되어 있다:
    //      (1) qp_interface_log 의 user_id/user_type — 위 fetchWithLog 컨텍스트에서 적재 (durable)
    //      (2) 본 완료 로그 — mailDelivery 등 (1) 에 없는 필드를 포함
    //    `[PUT /api/admin/members/:id]` 완료 로그와 동일 형식.
    console.log("[POST /api/auth/signup] 일반회원 대리 등록 완료", {
      ...auditCtx,
      targetUserTp: "GENERAL",
      mailDelivery,
    });

    // 7. 성공 응답
    return NextResponse.json({
      data: {
        userName,
        email,
        mailDelivery,
      },
    });
  } catch (error) {
    console.error("[POST /api/auth/signup]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
