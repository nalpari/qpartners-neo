import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { sekoPasswordResetSchema } from "@/lib/schemas/password-reset";
import { maskUserId } from "@/lib/interface-logger";
import { hashResetToken } from "@/lib/password-reset-token";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/notification-mail/utils";
import { sekoResetPwd } from "@/lib/seko-connector";
import { normalizeSekoId } from "@/lib/seko-reset-token";

const LOG = "[POST /api/auth/password-reset/seko/reset]";

/** 토큰이 없거나 이미 소비/만료된 경우 — 1단계부터 다시 하도록 안내한다. */
const TOKEN_INVALID_MESSAGE =
  "初期化の有効期限が切れました。施工IDの確認からもう一度お試しください。";

/**
 * 소비한 토큰 되살리기 — 재설정이 **일어나지 않았음이 확정**일 때만 호출한다.
 * 멱등이며, 실패해도 흐름을 막지 않는다(사용자는 1단계부터 다시 하면 된다).
 */
async function rollbackToken(tokenHash: string): Promise<void> {
  try {
    await prisma.passwordResetToken.updateMany({
      where: { token: tokenHash, used: true },
      data: { used: false },
    });
  } catch (error) {
    console.error(
      `${LOG} 토큰 롤백 실패 — 재시도 시 1단계부터 필요, tokenHashPrefix:`,
      tokenHash.slice(0, 8),
      error,
    );
  }
}

/**
 * 시공점 비밀번호 초기화 **2단계** — 신규 비밀번호 설정 (화면설계서 v1.4 p12 ⑧).
 *
 * AS-IS Connector **No.10 `resetPwd`**(X-Api-Key, `loginId`+`chgPwd`)를 호출한다.
 * p12 가 「비밀번호 설정 팝업에서 저장 → 완료」로 규정한 흐름이다.
 *
 * **자동 로그인을 하지 않는다.** p12 의 완료 Alert 가 「비밀번호가 변경되었습니다. 변경된
 * 비밀번호로 로그인해주세요.」이므로 세션을 발급하지 않고 로그인 화면으로 돌려보낸다
 * (판매점·일반의 `password-reset/confirm` 은 자동 로그인을 하지만 시공점은 사양이 다르다).
 * 덕분에 이 경로는 세션 발급 지점이 아니므로 `seko-id-gate` 대상도 아니다.
 *
 * **1단계 없이는 이 경로가 성립하지 않는다.** 1단계(`seko/check`)가 발급한 단명 일회용 토큰을
 * 원자적으로 소비한 요청만 처리한다. 토큰이 없으면 — 즉 시공ID 와 새 비밀번호만 들고 온
 * 단발 요청은 — 외부 호출에 닿지도 못한다.
 *
 * **재설정 대상은 요청 body 가 아니라 토큰이 정한다.** `loginId` 는 토큰 행에 저장된 값
 * (1단계에서 존재 확인을 통과한 입력 표기)을 쓴다. body 의 `sekoId` 는 토큰과 같은 식별자인지
 * 대조하는 용도뿐이다 — body 만 바꿔 다른 계정을 겨누는 경로를 만들지 않는다.
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

    const { sekoId, newPassword, resetToken } = parsed.data;
    const sekoIdKey = normalizeSekoId(sekoId);

    // 1단계와 동일한 기준의 IP rate limit. 버킷은 분리한다(정상 흐름은 check 1회 + reset 1회라,
    // 같은 버킷이면 한도가 절반이 된다). 토큰 대조 이전에 두는 이유는 토큰 추측 시도 자체를
    // 저지하기 위함이다.
    const ip = extractClientIp(request);
    const ipKey = ip ?? `account:${sekoIdKey}`;
    if (!checkRateLimit(`pw-reset-seko-set:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — 입력 식별자 기반 rate limit 적용`);
    }

    // DB 에는 SHA-256 해시만 저장된다 — 입력 토큰을 해싱해 조회한다.
    const tokenHash = hashResetToken(resetToken);
    let tokenRow;
    try {
      tokenRow = await prisma.passwordResetToken.findUnique({
        where: { token: tokenHash },
      });
    } catch (error) {
      console.error(`${LOG} 토큰 조회 실패:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。" },
        { status: 500 },
      );
    }

    // 미존재 / 다른 흐름의 토큰(메일 링크 경로) / 식별자 불일치 / 소비·만료 — 전부 동일 메시지.
    // 상태를 응답으로 구분시키면 토큰·시공ID 유효성을 탐색하는 채널이 된다.
    //
    // `userType !== "SEKO"` 를 함께 막는 이유: 판매점·일반의 메일 링크 토큰을 이 경로로 흘려
    // 시공점 재설정을 시키는 교차 사용을 차단한다(그쪽 토큰은 `confirm` 이 소비한다).
    const invalidReason =
      tokenRow == null
        ? "not-found"
        : tokenRow.userType !== "SEKO"
          ? "user-type-mismatch"
          : tokenRow.userId !== sekoIdKey
            ? "identifier-mismatch"
            : tokenRow.used
              ? "already-used"
              : tokenRow.expiresAt < new Date()
                ? "expired"
                : null;
    if (tokenRow == null || invalidReason != null) {
      console.warn(`${LOG} 재설정 토큰 무효 — 차단`, {
        sekoId: maskUserId(sekoId),
        reason: invalidReason,
      });
      return NextResponse.json({ error: TOKEN_INVALID_MESSAGE }, { status: 410 });
    }

    // 원자적 소비 (TOCTOU 방지 — 동시 요청 중 하나만 통과한다).
    let consumed;
    try {
      consumed = await prisma.passwordResetToken.updateMany({
        where: { token: tokenHash, used: false },
        data: { used: true },
      });
    } catch (error) {
      console.error(`${LOG} 토큰 소비 처리 실패:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。" },
        { status: 500 },
      );
    }
    if (consumed.count === 0) {
      // 위 조회와 이 갱신 사이에 다른 요청이 먼저 소비했다.
      console.warn(`${LOG} 재설정 토큰 경합 — 이미 소비됨`, { sekoId: maskUserId(sekoId) });
      return NextResponse.json({ error: TOKEN_INVALID_MESSAGE }, { status: 410 });
    }

    // 재설정 대상은 토큰이 정한다. 1단계가 존재 확인을 이미 통과했으므로 여기서 No.8
    // `email/check` 를 다시 호출하지 않는다 — 토큰이 그 확인의 증서다.
    const targetLoginId = tokenRow.loginId ?? tokenRow.userId;

    const resetResult = await sekoResetPwd(targetLoginId, newPassword, LOG);
    if (!resetResult.ok) {
      console.error(
        `${LOG} SEKO 비밀번호 재설정 실패 — status=${resetResult.error.status}, errorCode=${resetResult.error.errorCode ?? "-"}, indeterminate=${resetResult.indeterminate}`,
      );
      // 결과 불명(타임아웃·응답 파싱 실패)은 **변경되지 않았다고 단정하면 안 된다.**
      // "실패했으니 다시 시도하세요" 로 안내하면 이미 바뀐 새 비밀번호를 두고 옛 비밀번호로
      // 재시도하게 된다. 양쪽 가능성을 모두 열어두는 문구로 낸다(confirm 라우트와 같은 기준).
      //
      // 토큰도 되살리지 않는다 — 이미 바뀌었을 수 있는데 토큰을 살리면 일회용 불변식이 깨진다.
      if (resetResult.indeterminate) {
        return NextResponse.json(
          {
            error:
              "パスワードの変更結果を確認できませんでした。新しいパスワードでログインできない場合は、再度初期化を行ってください。",
          },
          { status: 502 },
        );
      }
      // 명시적 거부 — 비밀번호가 그대로임이 확정이므로 토큰을 되살려 재시도를 허용한다.
      // (살리지 않으면 커넥터의 일시적 거부 한 번에 1단계부터 다시 해야 한다.)
      await rollbackToken(tokenHash);
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
