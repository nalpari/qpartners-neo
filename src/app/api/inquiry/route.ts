import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { qp_inquiries_user_type } from "@/generated/prisma/client";

import { getUserFromRequest } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createInquirySchema } from "@/lib/schemas/inquiry";

// POST /api/inquiry — 문의 등록 (비로그인도 가능)
export async function POST(request: NextRequest) {
  try {
    // 인증은 선택 — 로그인 유저면 userType/userId 자동 세팅
    const user = await getUserFromRequest(request).catch(() => null);

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
        { error: "入力内容に不備があります" },
        { status: 400 },
      );
    }

    const inquiry = await prisma.inquiry.create({
      data: {
        ...result.data,
        userType: (user?.userTp as qp_inquiries_user_type) ?? null,
        userId: user?.userId ?? null,
        createdBy: user?.userId ?? null,
      },
    });

    console.log("[POST /api/inquiry] 문의 등록 완료", { id: inquiry.id });

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
