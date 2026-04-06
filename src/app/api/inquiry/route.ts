import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { qp_inquiries_user_type } from "@/generated/prisma/client";

import { getUserFromRequest } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { createInquirySchema } from "@/lib/schemas/inquiry";

const USER_TP_MAP: Record<string, qp_inquiries_user_type> = {
  ADMIN: qp_inquiries_user_type.ADMIN,
  STORE: qp_inquiries_user_type.STORE,
  SEKO: qp_inquiries_user_type.SEKO,
  GENERAL: qp_inquiries_user_type.GENERAL,
};

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

    const inquiry = await prisma.inquiry.create({
      data: {
        ...result.data,
        // 로그인 유저면 서버측 인증 정보로 덮어쓰기 (email 포함)
        ...(user && {
          companyName: user.compNm ?? result.data.companyName,
          userName: user.userNm ?? result.data.userName,
          email: user.email ?? result.data.email,
        }),
        userType: mappedUserType,
        userId: user?.userId ?? null,
        createdBy: user?.userId ?? null,
      },
    });

    console.log("[POST /api/inquiry] 문의 등록 완료", { id: inquiry.id });

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
