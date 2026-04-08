import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { qp_inquiries_user_type } from "@/generated/prisma/client";

import { getUserFromRequest } from "@/lib/jwt";
import { sendMail } from "@/lib/mailer";
import {
  INQUIRY_CONFIRMATION_SUBJECT,
  inquiryConfirmationMailHtml,
} from "@/lib/mail-templates/inquiry-confirmation";
import {
  INQUIRY_RECIPIENT_SUBJECT,
  inquiryRecipientMailHtml,
} from "@/lib/mail-templates/inquiry-recipient";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { createInquirySchema } from "@/lib/schemas/inquiry";

const USER_TP_MAP: Record<string, qp_inquiries_user_type> = {
  ADMIN: qp_inquiries_user_type.ADMIN,
  STORE: qp_inquiries_user_type.STORE,
  SEKO: qp_inquiries_user_type.SEKO,
  GENERAL: qp_inquiries_user_type.GENERAL,
};

const INQUIRY_TYPE_HEADER_CODE = "INQUIRY_TYPE";

/** 문자열 후보 배열에서 유효한 이메일만 trim/dedup 하여 반환 */
function pickRecipientEmails(candidates: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    // 단순 형식 검증 — 잘못된 값이 공통코드에 들어와도 sendMail 호출 전에 거름
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

// POST /api/inquiry — 문의 등록 (비로그인도 가능)
export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit: IP 기반 (body 파싱 전에 적용 — 파싱 DoS 방어)
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const ipKey = ip ?? "inquiry-no-ip";
    if (!checkRateLimit(`inquiry:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn("[POST /api/inquiry] IP 헤더 없음 — 제한적 rate limit 적용");
    }

    // 2. 인증은 선택 — 로그인 유저면 userType/userId 자동 세팅
    //    ConfigError(JWT_SECRET 미설정) 시 비로그인으로 계속 처리 (인증 선택 엔드포인트)
    let user: Awaited<ReturnType<typeof getUserFromRequest>> = null;
    try {
      user = await getUserFromRequest(request);
    } catch (authError: unknown) {
      console.error("[POST /api/inquiry] CRITICAL: JWT 설정 에러, 비로그인으로 처리:", authError);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error: unknown) {
      console.warn("[POST /api/inquiry] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "無効なリクエストです" },
        { status: 400 },
      );
    }

    const result = createInquirySchema.safeParse(body);
    if (!result.success) {
      console.warn("[POST /api/inquiry] 입력값 검증 실패", result.error.issues);
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

    // 3. email 기반 2차 rate limit (파싱 후 적용)
    if (!ip) {
      const emailKey = `inquiry:account:${result.data.email}`;
      if (!checkRateLimit(emailKey, 5, 60 * 60 * 1000)) {
        return NextResponse.json(
          { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
          { status: 429 },
        );
      }
    }

    // 4. userTp → DB enum 매핑 (매핑 실패 시 400 에러)
    const mappedUserType = user ? (USER_TP_MAP[user.userTp] ?? null) : null;
    if (user && !mappedUserType) {
      console.error(`[POST /api/inquiry] userTp 매핑 실패: "${user.userTp}"`);
      return NextResponse.json(
        { error: "ユーザータイプが無効です" },
        { status: 400 },
      );
    }

    // 5. 서버측에서 최종 사용될 회사명/성명/이메일 결정 (로그인 유저는 인증 정보 우선)
    const finalCompanyName = user?.compNm ?? result.data.companyName;
    const finalUserName = user?.userNm ?? result.data.userName;
    const finalEmail = user?.email ?? result.data.email;

    const inquiry = await prisma.inquiry.create({
      data: {
        ...result.data,
        companyName: finalCompanyName,
        userName: finalUserName,
        email: finalEmail,
        userType: mappedUserType,
        userId: user?.userId ?? null,
        createdBy: user?.userId ?? null,
      },
    });

    console.log("[POST /api/inquiry] 문의 등록 완료", { id: inquiry.id });

    // 6. 메일 발송 — 화면설계서 p.42-43, design 2장
    //    문의 자체는 이미 DB 저장이 완료되었으므로, 메일 발송 실패는 응답을 막지 않는다.
    //    실패 시 ERROR 로그를 남겨 운영자가 수동 후처리(직접 연락)할 수 있도록 한다.
    try {
      const codeDetail = await prisma.codeDetail.findFirst({
        where: {
          code: result.data.inquiryType,
          isActive: true,
          header: { headerCode: INQUIRY_TYPE_HEADER_CODE, isActive: true },
        },
        select: {
          codeName: true,
          relCode1: true,
          relCode2: true,
          relCode3: true,
        },
      });

      if (!codeDetail) {
        console.error(
          "[POST /api/inquiry] INQUIRY_TYPE 공통코드 매칭 실패 — 메일 미발송",
          { inquiryId: inquiry.id, inquiryType: result.data.inquiryType },
        );
      } else {
        const inquiryTypeName = codeDetail.codeName;
        const recipientEmails = pickRecipientEmails([
          codeDetail.relCode1,
          codeDetail.relCode2,
          codeDetail.relCode3,
        ]);

        if (recipientEmails.length === 0) {
          console.error(
            "[POST /api/inquiry] 수신 담당자 이메일 미설정 — 메일 미발송",
            { inquiryId: inquiry.id, inquiryType: result.data.inquiryType },
          );
        } else {
          // 수신 담당자 메일 (relCode1~3 각각으로 발송, 한 명 실패해도 다른 사람에게는 발송 시도)
          const recipientHtml = inquiryRecipientMailHtml({
            inquiryTypeName,
            companyName: finalCompanyName,
            userName: finalUserName,
            email: finalEmail,
            tel: result.data.tel,
            title: result.data.title,
            content: result.data.content,
          });
          await Promise.all(
            recipientEmails.map((to) =>
              sendMail({ to, subject: INQUIRY_RECIPIENT_SUBJECT, html: recipientHtml }).catch(
                (mailError: unknown) => {
                  console.error(
                    "[POST /api/inquiry] 수신 담당자 메일 발송 실패",
                    { inquiryId: inquiry.id, to, error: mailError },
                  );
                },
              ),
            ),
          );
        }

        // 작성자 접수 확인 메일
        try {
          await sendMail({
            to: finalEmail,
            subject: INQUIRY_CONFIRMATION_SUBJECT,
            html: inquiryConfirmationMailHtml({
              userName: finalUserName,
              inquiryTypeName,
              title: result.data.title,
            }),
          });
        } catch (confirmError: unknown) {
          console.error(
            "[POST /api/inquiry] 작성자 접수 확인 메일 발송 실패",
            { inquiryId: inquiry.id, error: confirmError },
          );
        }
      }
    } catch (mailFlowError: unknown) {
      console.error(
        "[POST /api/inquiry] 메일 발송 흐름 실패 (DB 저장은 완료)",
        { inquiryId: inquiry.id, error: mailFlowError },
      );
    }

    return NextResponse.json(
      { data: { id: inquiry.id } },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[POST /api/inquiry] 문의 등록 실패:", error);
    return NextResponse.json(
      { error: "お問い合わせの登録に失敗しました" },
      { status: 500 },
    );
  }
}
