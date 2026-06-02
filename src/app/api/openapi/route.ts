import { NextResponse } from "next/server";

import { isApiDocsEnabled } from "@/lib/api-docs";
import { openApiSpec } from "@/lib/openapi";

export function GET() {
  try {
    // 운영(production)에서는 OpenAPI 스펙 원본을 노출하지 않는다 — 존재 자체를 숨기기 위해 404 반환.
    // (/api-docs UI 가 이 경로를 fetch 하므로 UI 와 동일 기준으로 함께 차단)
    if (!isApiDocsEnabled()) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.json(openApiSpec);
  } catch (error) {
    console.error("[GET /api/openapi]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
