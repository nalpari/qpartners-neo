import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { sekoPasswordResetCheckSchema } from "@/lib/schemas/password-reset";
import { maskUserId } from "@/lib/interface-logger";
import {
  generateRawResetToken,
  hashResetToken,
} from "@/lib/password-reset-token";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/notification-mail/utils";
import { sekoEmailCheck } from "@/lib/seko-connector";
import {
  SEKO_RESET_TOKEN_TTL_MS,
  SEKO_RESET_TOKENS_PER_HOUR,
  normalizeSekoId,
} from "@/lib/seko-reset-token";

const LOG = "[POST /api/auth/password-reset/seko/check]";

/**
 * 시공점 비밀번호 초기화 **1단계** — 시공ID 존재 확인 + 재설정 토큰 발급 (화면설계서 v1.4 p12 ④).
 *
 * 입력은 **시공ID** 다. p12 ② 가 「시공 ID 입력박스」, ④ 가 「입력정보가 DB 에 있는 시공ID 인지
 * 체크」로 규정한다 — 로그인 화면(p10)은 「이메일 또는 시공ID」 겸용이지만 **초기화는 시공ID
 * 단독**이다. 이 단계는 시공ID 를 정상 통과하지만, **2단계가 시공ID 를 받지 못한다**
 * (No.10 `resetPwd` 제약 — 2026-08-24 preview 실측, 상세는 `seko/reset/route.ts` 주석).
 *
 * p12 에서 시공점 초기화는 「이메일 링크 발송」이 아니라 **시공ID 입력 → DB 대조 → 비밀번호
 * 설정 팝업 즉시 호출** 로 바뀌었다(p11 의 시공점 패널은 "프로세스 변경" 으로 폐기 표기).
 * 그래서 이 경로는 메일을 보내지 않는다.
 *
 * 존재 확인은 AS-IS Connector **No.8 `email/check`** 를 쓴다. 사양서(20260817) r6 의 `loginId`
 * 가 「ログインID (メールまたは施工ID)」라 시공ID 를 그대로 넣을 수 있다. 요청은 **loginId 단독**
 * 이다 — 사양서의 groupKind/sei/mei 를 함께 보내면 400 INVALID_REQUEST (2026-08-13 preview 실측).
 *
 * **왜 토큰을 발급하는가.** 2단계(`seko/reset`)와 이 단계 사이에 서버 상태가 없으면 2단계가
 * 단독 호출 가능해진다 — 시공ID 하나만 알면 비인증 요청 1건으로 비밀번호가 바뀐다. 시공ID 에
 * 바인딩된 단명 일회용 토큰을 발급하고 2단계가 이를 원자적으로 소비하게 해서, 1단계를 거치지
 * 않은 요청을 차단한다. 소유 증명은 아니다(공격자도 1단계를 호출할 수 있다) — 소유 증명 수단이
 * 없는 이유는 `schemas/password-reset.ts` 의 SEKO 절 주석 참조. 다만 재설정을 시작할 수 있는
 * 지점이 여기 하나로 모이므로, 특정 계정을 겨눈 시도에 발급 한도를 걸 수 있게 된다
 * (식별자당 1시간 {@link SEKO_RESET_TOKENS_PER_HOUR} 회 — 계정 단위가 아닌 이유는 상수 주석 참조).
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
    // 토큰 조회·집계 키. 시공ID 는 대소문자 표기가 갈릴 수 있어 정규화한다 —
    // 정규화하지 않으면 표기만 바꿔 계정 단위 한도를 우회한다.
    const sekoIdKey = normalizeSekoId(sekoId);

    // IP 단위 rate limit — 대량 열거 1차 방어선.
    // 키 구성·한도는 `password-reset/request` 와 동일하게 맞춘다 — IP 있으면 10회/시간,
    // 없으면 입력 식별자 기준 5회/시간.
    const ip = extractClientIp(request);
    const ipKey = ip ?? `account:${sekoIdKey}`;
    if (!checkRateLimit(`pw-reset-seko:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — 입력 식별자 기반 rate limit 적용`);
    }

    // 식별자 단위 rate limit (DB) — 동일 식별자 1시간 {@link SEKO_RESET_TOKENS_PER_HOUR} 건.
    // IP 단위 한도는 **단일 계정을 겨눈 시도**를 제한하지 못한다(공격자가 IP 를 바꾸면 무제한).
    // 발급 이력이 곧 카운터다.
    //
    // ⚠️ 계정 단위가 아니다 — 시공점은 시공ID 와 이메일 둘 다로 로그인하고 둘을 서로 매핑할
    // I/F 가 없어, 한 계정을 겨눈 시도는 최대 이 한도의 2배까지 가능하다(상수 주석 참조).
    //
    // 외부 호출보다 **앞**에 둔다 — 한도 초과 요청으로 SEKO 를 두드리지 않는다.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let recentCount: number;
    try {
      recentCount = await prisma.passwordResetToken.count({
        where: {
          userType: "SEKO",
          userId: sekoIdKey,
          createdAt: { gte: oneHourAgo },
        },
      });
    } catch (error) {
      console.error(`${LOG} 발급 이력 조회 실패:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。" },
        { status: 500 },
      );
    }
    if (recentCount >= SEKO_RESET_TOKENS_PER_HOUR) {
      console.warn(`${LOG} 계정 단위 한도 초과`, { sekoId: maskUserId(sekoId) });
      return NextResponse.json(
        { error: "しばらく経ってから再度お試しください。（1時間以内の初期化回数上限）" },
        { status: 429 },
      );
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

    // 재설정 토큰 발급.
    //  - `userId` 컬럼: 정규화한 **입력 식별자**(시공ID 또는 이메일 — 시공점은 둘 다 로그인
    //    식별자다). 판매점·일반은 이 컬럼에 평문 email 을 담지만 시공점은 이메일을 알 수 없다
    //    (No.8 응답에 없음). SEKO 응답 필드 `userId`(내부 PK 숫자문자열)와는 무관하다 —
    //    컬럼명만 같다.
    //  - `loginId` 컬럼: 입력 표기 그대로. 2단계가 No.10 `resetPwd` 에 넘길 값이며,
    //    **재설정 대상은 요청 body 가 아니라 이 값으로 확정한다.**
    //  - TTL 은 판매점·일반의 메일 링크(1시간)보다 짧게 잡는다. 팝업 안에서 곧바로 이어지는
    //    단계라 긴 유효기간이 필요 없고, 짧을수록 유출된 토큰의 창이 좁아진다.
    const rawToken = generateRawResetToken();
    const tokenHash = hashResetToken(rawToken);
    try {
      await prisma.passwordResetToken.create({
        data: {
          userType: "SEKO",
          userId: sekoIdKey,
          loginId: sekoId,
          token: tokenHash,
          expiresAt: new Date(Date.now() + SEKO_RESET_TOKEN_TTL_MS),
        },
      });
    } catch (error) {
      console.error(`${LOG} 재설정 토큰 발급 실패:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。" },
        { status: 500 },
      );
    }

    // 이전에 발급된 미사용 토큰 무효화 — 활성 토큰을 계정당 1건으로 유지한다.
    // 신규 발급 **후**에 수행하므로(신규는 `token: { not }` 로 제외) 실패해도 방금 발급한
    // 토큰은 온전하다. 무효화 실패는 활성 토큰이 여러 개 남는 것뿐이고 각각 일회용이므로
    // 흐름을 막지 않고 WARN 으로 남긴다.
    try {
      await prisma.passwordResetToken.updateMany({
        where: {
          userType: "SEKO",
          userId: sekoIdKey,
          used: false,
          token: { not: tokenHash },
        },
        data: { used: true },
      });
    } catch (error) {
      console.warn(`${LOG} 기존 토큰 무효화 실패 — 신규 토큰은 정상 발급됨:`, error);
    }

    console.log(`${LOG} 시공ID 확인 완료 — 재설정 토큰 발급`, {
      sekoId: maskUserId(sekoId),
    });
    // `resetToken` 은 2단계에서 그대로 되돌려받아 소비한다. 메일·URL 을 타지 않고 팝업
    // 메모리에만 머무르므로 링크 방식과 달리 수신함·이력에 남지 않는다.
    return NextResponse.json({
      data: { exists: true, resetToken: rawToken },
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
      { error: "パスワード初期化処理中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
