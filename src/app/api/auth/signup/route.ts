import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";

// POST /api/auth/signup — 일반 회원가입 (QSP newUserReq 프록시 + 승인완료 메일)
export async function POST(request: NextRequest) {
  try {
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
          userId: maskEmail(email),
          userType: "GENERAL",
        },
      );
    } catch (error: unknown) {
      console.error("[POST /api/auth/signup] QSP API 호출 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    // I6: QSP HTTP 비정상 응답 처리
    if (!qspResponse.ok) {
      console.error("[POST /api/auth/signup] QSP 비정상 응답:", qspResponse.status);
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
      console.error("[POST /api/auth/signup] QSP 응답 JSON 파싱 실패:", error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error(
        "[POST /api/auth/signup] QSP 응답 스키마 불일치:",
        parsed.error.issues,
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
      console.error("[POST /api/auth/signup] QSP 등록 실패:", msg);

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

    // 6. 성공 응답
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
