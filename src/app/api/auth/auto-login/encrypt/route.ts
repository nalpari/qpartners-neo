import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";

/** QSP autoLoginEncryptData 응답 data — userId: 암호문, url: 이동 base URL */
type QspEncryptData = { userId: string; url: string };

// POST /api/auth/auto-login/encrypt — 자동로그인 암호화 URL 생성
export async function POST(request: NextRequest) {
  try {
    // 1. 인증 확인 (middleware에서 X-User-Id 주입)
    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }

    // 2. QSP 암호화 API 호출
    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        `${QSP_API.autoLoginEncrypt}?autoLoginParam1=${encodeURIComponent(userId)}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "autoLoginEncryptData",
          callerRoute: "[POST /api/auth/auto-login/encrypt]",
          userId: maskEmail(userId),
        },
      );
    } catch (error) {
      console.error("[POST /api/auth/auto-login/encrypt] QSP 암호화 API 호출 실패:", error);
      return NextResponse.json(
        { error: "暗号化サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error("[POST /api/auth/auto-login/encrypt] QSP 비정상 응답:", qspResponse.status);
      return NextResponse.json(
        { error: "暗号化サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    // 4. QSP 응답 파싱
    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 파싱 실패:", error);
      return NextResponse.json(
        { error: "暗号化サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspBody;
    if (
      !parsed || typeof parsed !== "object" ||
      !("data" in parsed) || !parsed.data ||
      typeof parsed.data !== "object" ||
      !("userId" in parsed.data) || typeof parsed.data.userId !== "string" ||
      !("url" in parsed.data) || typeof parsed.data.url !== "string"
    ) {
      console.error("[POST /api/auth/auto-login/encrypt] QSP 응답 형식 불일치:", qspBody);
      return NextResponse.json(
        { error: "暗号化サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    // 5. 이동 URL 생성 (QSP가 반환한 url + 암호문)
    const { userId: cipherText, url: qspUrl } = parsed.data as QspEncryptData;
    const redirectUrl = `${qspUrl}${encodeURIComponent(cipherText)}`;

    return NextResponse.json({
      data: { url: redirectUrl },
    });
  } catch (error) {
    console.error("[POST /api/auth/auto-login/encrypt]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
