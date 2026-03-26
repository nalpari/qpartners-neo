import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  signupRequestSchema,
  qspSignupResponseSchema,
} from "@/lib/schemas/signup";
import { sendMail } from "@/lib/mailer";
import {
  signupCompleteMailHtml,
  SIGNUP_COMPLETE_SUBJECT,
} from "@/lib/mail-templates/signup-complete";

// POST /api/auth/signup — 일반 회원가입 (QSP newUserReq 프록시 + 승인완료 메일)
export async function POST(request: NextRequest) {
  // C3: 환경변수는 함수 내부에서 읽기 (Edge/서버리스 빌드타임 undefined 방지)
  const QSP_SIGNUP_API_URL = process.env.QSP_SIGNUP_API_URL;
  if (!QSP_SIGNUP_API_URL) {
    console.error("[POST /api/auth/signup] QSP_SIGNUP_API_URL 환경변수 미설정");
    return NextResponse.json(
      { error: "서버 설정 오류입니다" },
      { status: 500 },
    );
  }

  // 1. Request body 파싱 + Zod 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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
    email,
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

  // 2. QSP newUserReq I/F 호출
  let qspResponse: Response;
  try {
    qspResponse = await fetch(QSP_SIGNUP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // M4: 10초 타임아웃
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        userTp: "GENERAL",
        userId: email,
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
    });
  } catch (error) {
    console.error("[POST /api/auth/signup] QSP API 호출 실패:", error);
    return NextResponse.json(
      { error: "외부 서버에 연결할 수 없습니다" },
      { status: 502 },
    );
  }

  // I6: QSP HTTP 비정상 응답 처리
  if (!qspResponse.ok) {
    console.error("[POST /api/auth/signup] QSP 비정상 응답:", qspResponse.status);
    return NextResponse.json(
      { error: "외부 서버 오류가 발생했습니다" },
      { status: 502 },
    );
  }

  // 3. QSP 응답 파싱
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch {
    console.error("[POST /api/auth/signup] QSP 응답 JSON 파싱 실패");
    return NextResponse.json(
      { error: "외부 서버 응답을 처리할 수 없습니다" },
      { status: 502 },
    );
  }

  const parsed = qspSignupResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error("[POST /api/auth/signup] QSP 응답 스키마 불일치:", parsed.error);
    return NextResponse.json(
      { error: "외부 서버 응답 형식이 올바르지 않습니다" },
      { status: 502 },
    );
  }

  const qsp = parsed.data;

  // 4. 성공/실패 판별
  if (qsp.result.resultCode !== "S") {
    // QSP 에러 메시지에서 이메일 중복 등 판별
    const msg = qsp.result.resultMsg;
    console.error("[POST /api/auth/signup] QSP 등록 실패:", msg);
    return NextResponse.json(
      { error: msg || "회원가입에 실패했습니다" },
      { status: 409 },
    );
  }

  // 5. 승인완료 메일 발송 (비동기 — 메일 실패해도 가입 성공 응답)
  const siteUrl = process.env.SITE_URL ?? "https://dev.q-partners.q-cells.jp";
  const userName = `${user2ndNm}${user1stNm}`;

  sendMail({
    to: email,
    subject: SIGNUP_COMPLETE_SUBJECT,
    html: signupCompleteMailHtml({
      userNm: userName,
      email,
      siteUrl,
    }),
  }).catch((error) => {
    console.error("[POST /api/auth/signup] 승인완료 메일 발송 실패:", error);
  });

  // 6. 성공 응답
  return NextResponse.json({
    data: {
      userName,
      email,
    },
  });
}
