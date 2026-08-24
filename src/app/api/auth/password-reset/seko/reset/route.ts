import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { sekoPasswordResetSchema } from "@/lib/schemas/password-reset";
import { maskUserId } from "@/lib/interface-logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/notification-mail/utils";
import { sekoEmailCheck, sekoResetPwd } from "@/lib/seko-connector";

const LOG = "[POST /api/auth/password-reset/seko/reset]";

/**
 * 시공점 비밀번호 초기화 **2단계** — 신규 비밀번호 설정 (화면설계서 v1.4 p12 ⑧).
 *
 * AS-IS Connector **No.10 `resetPwd`**(X-Api-Key, `loginId`+`chgPwd`)를 그대로 호출한다.
 * 토큰도 메일도 없다 — p12 가 「비밀번호 설정 팝업에서 저장 → 완료」로 규정한 흐름이다.
 *
 * **자동 로그인을 하지 않는다.** p12 의 완료 Alert 가 「비밀번호가 변경되었습니다. 변경된
 * 비밀번호로 로그인해주세요.」이므로 세션을 발급하지 않고 로그인 화면으로 돌려보낸다
 * (판매점·일반의 `password-reset/confirm` 은 자동 로그인을 하지만 시공점은 사양이 다르다).
 * 덕분에 이 경로는 세션 발급 지점이 아니므로 `seko-id-gate` 대상도 아니다.
 *
 * 1단계(`seko/check`)의 결과를 **신뢰하지 않고 존재 확인을 다시 한다.** 두 호출 사이에 상태를
 * 두지 않으므로 이 라우트만 단독 호출될 수 있고, 그때 존재하지 않는 시공ID 로 resetPwd 를
 * 치면 커넥터 에러를 사용자에게 그대로 노출하게 된다.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn(`${LOG} Request body 파싱 실패:`, error);
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = sekoPasswordResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { sekoId, newPassword } = parsed.data;

    // 1단계와 동일한 기준의 rate limit — 이 경로만 직접 호출해 비밀번호를 바꾸는 시도를 막는다.
    // 버킷은 1단계와 분리한다(정상 흐름은 check 1회 + reset 1회라, 같은 버킷이면 한도가 절반이 된다).
    const ip = extractClientIp(request);
    const ipKey = ip ?? `account:${sekoId.toLowerCase()}`;
    if (!checkRateLimit(`pw-reset-seko-set:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — 입력 식별자 기반 rate limit 적용`);
    }

    const checkResult = await sekoEmailCheck(sekoId, LOG);
    if (!checkResult.ok) {
      console.error(
        `${LOG} SEKO 회원 존재확인 실패 — status=${checkResult.error.status}, errorCode=${checkResult.error.errorCode ?? "-"}`,
      );
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました。しばらく経ってから再度お試しください。" },
        { status: 502 },
      );
    }
    if (!checkResult.data.exists) {
      console.warn(`${LOG} 시공ID 미존재 — 비밀번호 설정 차단`, { sekoId: maskUserId(sekoId) });
      return NextResponse.json(
        {
          error:
            "一致する会員情報がありません。入力された情報をもう一度ご確認ください。",
        },
        { status: 404 },
      );
    }

    const resetResult = await sekoResetPwd(sekoId, newPassword, LOG);
    if (!resetResult.ok) {
      console.error(
        `${LOG} SEKO 비밀번호 재설정 실패 — status=${resetResult.error.status}, errorCode=${resetResult.error.errorCode ?? "-"}, indeterminate=${resetResult.indeterminate}`,
      );
      // 결과 불명(타임아웃·응답 파싱 실패)은 **변경되지 않았다고 단정하면 안 된다.**
      // "실패했으니 다시 시도하세요" 로 안내하면 이미 바뀐 새 비밀번호를 두고 옛 비밀번호로
      // 재시도하게 된다. 양쪽 가능성을 모두 열어두는 문구로 낸다(confirm 라우트와 같은 기준).
      if (resetResult.indeterminate) {
        return NextResponse.json(
          {
            error:
              "パスワードの変更結果を確認できませんでした。新しいパスワードでログインできない場合は、再度初期化を行ってください。",
          },
          { status: 502 },
        );
      }
      // 커넥터 원문을 그대로 내보내지 않는다(.claude/rules/api.md — 외부 에러 메시지 직접 노출 금지).
      // sekoResetPwd 가 이미 일반화된 문구로 변환해 돌려준다.
      return NextResponse.json(
        { error: resetResult.error.error },
        { status: resetResult.error.status },
      );
    }

    console.log(`${LOG} 비밀번호 재설정 완료`, { sekoId: maskUserId(sekoId) });
    // 세션을 발급하지 않는다 — 화면은 이 응답을 받고 Alert 후 로그인 화면으로 돌아간다.
    return NextResponse.json({
      data: {
        message: "パスワードが変更されました。変更されたパスワードでログインしてください。",
      },
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${LOG} 설정 에러:`, error.name, "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요");
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    console.error(LOG, error);
    return NextResponse.json(
      { error: "パスワード変更処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
