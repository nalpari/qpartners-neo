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
    // Rate limit: IP 기반, 시간당 10건
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const rateLimitKey = ip ?? "global";
    if (!checkRateLimit(`inquiry:${rateLimitKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }

    // 인증은 선택 — 로그인 유저면 userType/userId 자동 세팅
    const user = await getUserFromRequest(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
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

    // userTp → DB enum 매핑 (매핑 누락 시 경고 로그)
    const mappedUserType = user ? (USER_TP_MAP[user.userTp] ?? null) : null;
    if (user && !mappedUserType) {
      console.warn(`[POST /api/inquiry] userTp 매핑 누락: "${user.userTp}" → null 폴백`, { userId: user.userId });
    }

    const inquiry = await prisma.inquiry.create({
      data: {
        ...result.data,
        // 로그인 유저면 서버측 인증 정보로 덮어쓰기
        ...(user && {
          companyName: user.compNm ?? result.data.companyName,
          userName: user.userNm ?? result.data.userName,
        }),
        userType: mappedUserType,
        userId: user?.userId ?? null,
        createdBy: user?.userId ?? null,
      },
    });

    console.log("[POST /api/inquiry] 문의 등록 완료", { id: inquiry.id, userId: user?.userId ?? "anonymous" });

    return NextResponse.json(
      { data: { id: inquiry.id } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/inquiry] 문의 등록 실패", error);
    return NextResponse.json(
      { error: "お問い合わせの登録に失敗しました" },
      { status: 500 },
    );
  }
}
