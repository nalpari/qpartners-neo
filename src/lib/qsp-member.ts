import { NextResponse } from "next/server";

import { QSP_API } from "@/lib/config";
import { qspMemberDetailResponseSchema } from "@/lib/schemas/member";
import type { z } from "zod";

export type QspMemberDetail = NonNullable<
  z.infer<typeof qspMemberDetailResponseSchema>["data"]
>;

/**
 * QSP 유저 정보 조회 공통 헬퍼 (사양서 No.13 userDetail).
 * userTp에 따라 조회 키가 다름: GENERAL → email, ADMIN/STORE → loginId
 */
export async function fetchQspUserDetail(
  rawId: string,
  userTp: string,
  logTag: string,
): Promise<{ ok: true; detail: QspMemberDetail } | { ok: false; response: NextResponse }> {
  const qspParams = new URLSearchParams({ accsSiteCd: "QPARTNERS", userTp });
  if (userTp === "GENERAL") {
    qspParams.set("email", rawId);
  } else {
    qspParams.set("loginId", rawId);
  }

  let qspResponse: Response;
  try {
    qspResponse = await fetch(`${QSP_API.userDetail}?${qspParams.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    console.error(`${logTag} QSP 회원 조회 실패:`, error);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーに接続できません" }, { status: 502 }),
    };
  }
  if (!qspResponse.ok) {
    console.error(`${logTag} QSP 비정상 응답:`, qspResponse.status);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーエラーが発生しました" }, { status: 502 }),
    };
  }
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error: unknown) {
    console.error(`${logTag} QSP 응답 파싱 실패:`, error);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーの応答を処理できません" }, { status: 502 }),
    };
  }
  const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(`${logTag} QSP 응답 스키마 불일치:`, parsed.error.issues);
    return {
      ok: false,
      response: NextResponse.json({ error: "外部サーバーの応答形式が正しくありません" }, { status: 502 }),
    };
  }
  if (parsed.data.result.resultCode !== "S" || !parsed.data.data) {
    console.warn(`${logTag} QSP 회원 조회 결과 없음:`, {
      resultCode: parsed.data.result.resultCode,
      message: parsed.data.result.message,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "会員情報が見つかりません" }, { status: 404 }),
    };
  }
  return { ok: true, detail: parsed.data.data };
}
