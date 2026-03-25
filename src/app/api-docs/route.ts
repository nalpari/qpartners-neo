import { ApiReference } from "@scalar/nextjs-api-reference";
import { NextResponse } from "next/server";

const config = {
  spec: { url: "/api/openapi" },
  theme: "kepler" as const,
};

const handler = ApiReference(config);

export async function GET(request: Request) {
  try {
    return await handler(request);
  } catch {
    return NextResponse.json(
      { error: "API Reference를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
