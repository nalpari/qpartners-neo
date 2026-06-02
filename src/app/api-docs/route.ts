import { ApiReference } from "@scalar/nextjs-api-reference";
import { NextResponse } from "next/server";

import { isApiDocsEnabled } from "@/lib/api-docs";

const config = {
  spec: { url: "/api/openapi" },
  theme: "kepler" as const,
  hiddenClients: true as const,
};

const handler = ApiReference(config);

export async function GET() {
  try {
    // 운영(production)에서는 문서 UI 를 노출하지 않는다 — 존재 자체를 숨기기 위해 404 반환.
    if (!isApiDocsEnabled()) {
      return new NextResponse(null, { status: 404 });
    }
    return await handler();
  } catch (error) {
    console.error("[GET /api-docs]", error);
    return NextResponse.json(
      { error: "API Reference를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
