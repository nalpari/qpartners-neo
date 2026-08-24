import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { sekoPasswordResetCheckSchema } from "@/lib/schemas/password-reset";
import { maskUserId } from "@/lib/interface-logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/notification-mail/utils";
import { sekoEmailCheck } from "@/lib/seko-connector";

const LOG = "[POST /api/auth/password-reset/seko/check]";

/**
 * 시공점 비밀번호 초기화 **1단계** — 시공ID 존재 확인 (화면설계서 v1.4 p12 ④).
 *
 * p12 에서 시공점 초기화는 「이메일 링크 발송」이 아니라 **시공ID 입력 → DB 대조 → 비밀번호
 * 설정 팝업 즉시 호출** 로 바뀌었다(p11 의 시공점 패널은 "프로세스 변경" 으로 폐기 표기).
 * 그래서 이 경로는 토큰을 만들지도, 메일을 보내지도 않는다.
 *
 * 존재 확인은 AS-IS Connector **No.8 `email/check`** 를 쓴다. 사양서(20260817) r6 의 `loginId`
 * 가 「ログインID (メールまたは施工ID)」라 시공ID 를 그대로 넣을 수 있다. 요청은 **loginId 단독**
 * 이다 — 사양서의 groupKind/sei/mei 를 함께 보내면 400 INVALID_REQUEST (2026-08-13 preview 실측).
 *
 * ⚠️ **열거 방지를 하지 않는다.** p12 가 미존재 시 「일치하는 회원 정보가 없습니다. 입력하신
 * 정보를 다시 확인해 주세요.」를 그대로 노출하도록 규정하고 있어(④), 존재/미존재가 응답으로
 * 구분된다. 대신 rate limit 으로 대량 조회를 막는다.
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

    const parsed = sekoPasswordResetCheckSchema.safeParse(body);
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

    const { sekoId } = parsed.data;

    // 이 흐름에는 소유 증명이 없으므로(스키마 주석 참조) rate limit 이 유일한 방어선이다.
    // 키 구성·한도는 `password-reset/request` 와 동일하게 맞춘다 — IP 있으면 10회/시간,
    // 없으면 입력 식별자 기준 5회/시간. 시공ID 는 대소문자 표기가 갈릴 수 있어 정규화한다
    // (정규화하지 않으면 표기만 바꿔 한도를 우회한다).
    const ip = extractClientIp(request);
    const ipKey = ip ?? `account:${sekoId.toLowerCase()}`;
    if (!checkRateLimit(`pw-reset-seko:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
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
      // 커넥터 장애를 「회원 미존재」로 뭉개면 사용자가 시공ID 를 잘못 입력한 줄 알고
      // 재입력만 반복한다. request 라우트와 같은 기준으로 502 로 분리한다.
      console.error(
        `${LOG} SEKO 회원 존재확인 실패 — status=${checkResult.error.status}, errorCode=${checkResult.error.errorCode ?? "-"}`,
      );
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました。しばらく経ってから再度お試しください。" },
        { status: 502 },
      );
    }

    if (!checkResult.data.exists) {
      console.warn(`${LOG} 시공ID 미존재`, { sekoId: maskUserId(sekoId) });
      return NextResponse.json(
        {
          error:
            "一致する会員情報がありません。入力された情報をもう一度ご確認ください。",
        },
        { status: 404 },
      );
    }

    console.log(`${LOG} 시공ID 확인 완료`, { sekoId: maskUserId(sekoId) });
    // 2단계(`seko/reset`)는 이 응답을 신뢰하지 않고 존재 확인을 다시 수행한다 — 상태를
    // 서버에 두지 않는 이유는, 단기 토큰을 발급해도 공격자가 1단계를 그대로 통과할 수 있어
    // 실질적인 방어가 되지 않기 때문이다(방어선은 rate limit 이다).
    return NextResponse.json({ data: { exists: true } });
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
      { error: "パスワード初期化処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
