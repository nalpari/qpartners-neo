import type { z } from "zod";

import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog } from "@/lib/interface-logger";
import { qspMemberDetailResponseSchema } from "@/lib/schemas/member";
import type { UserTp } from "@/lib/schemas/common";

export type QspMemberDetail = NonNullable<
  z.infer<typeof qspMemberDetailResponseSchema>["data"]
>;

export type QspFetchError = {
  error: string;
  status: number;
};

/**
 * QSP 유저 정보 조회 공통 헬퍼 (사양서 No.13 userDetail).
 * userTp에 따라 조회 키가 다름: GENERAL → email, ADMIN/STORE/SEKO → loginId
 *
 * framework-agnostic: NextResponse를 반환하지 않으며, 호출부에서 HTTP 응답으로 변환한다.
 */
export async function fetchQspUserDetail(
  rawId: string,
  userTp: UserTp,
  logTag: string,
  userId?: string,
): Promise<{ ok: true; detail: QspMemberDetail } | { ok: false; error: QspFetchError }> {
  const qspParams = new URLSearchParams({ accsSiteCd: SITE_DEFAULTS.accsSiteCd, userTp });
  if (userTp === "GENERAL") {
    qspParams.set("email", rawId);
  } else {
    qspParams.set("loginId", rawId);
  }

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.userDetail}?${qspParams.toString()}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: logTag,
        userId: userId ?? rawId,
        userType: userTp,
      },
    );
  } catch (error: unknown) {
    console.error(`${logTag} QSP 회원 조회 실패:`, error);
    return { ok: false, error: { error: "外部サーバーに接続できません", status: 502 } };
  }
  if (!qspResponse.ok) {
    console.error(`${logTag} QSP 비정상 응답:`, qspResponse.status);
    return { ok: false, error: { error: "外部サーバーエラーが発生しました", status: 502 } };
  }
  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (error: unknown) {
    console.error(`${logTag} QSP 응답 파싱 실패:`, error);
    return { ok: false, error: { error: "外部サーバーの応答を処理できません", status: 502 } };
  }
  const parsed = qspMemberDetailResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    console.error(`${logTag} QSP 응답 스키마 불일치:`, parsed.error.issues);
    return { ok: false, error: { error: "外部サーバーの応答形式が正しくありません", status: 502 } };
  }
  const resultCode = parsed.data.result.resultCode;
  // F_NOT_USER(회원 미존재)만 404, 그 외 비정상 코드는 502
  if (resultCode === "F_NOT_USER") {
    console.warn(`${logTag} QSP 회원 조회 결과 없음 (resultCode: ${resultCode})`);
    return { ok: false, error: { error: "会員情報が見つかりません", status: 404 } };
  }
  if (resultCode !== "S" || !parsed.data.data) {
    console.error(`${logTag} QSP 회원 조회 실패 (resultCode: ${resultCode})`);
    return { ok: false, error: { error: "外部サーバーエラーが発生しました", status: 502 } };
  }
  return { ok: true, detail: parsed.data.data };
}
