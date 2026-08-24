import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { sekoPasswordResetCheckSchema } from "@/lib/schemas/password-reset";
import { sekoEmailCheck } from "@/lib/seko-connector";

const LOG = "[POST /api/auth/seko/password-reset/check]";

/**
 * 회원 미존재·입력 형식 오류 공통 응답 문구 (요구사항 원문 지정).
 *
 * 존재 여부를 단정하는 문구라 시공ID 열거(User Enumeration)를 완전히 막지는 못한다 —
 * 발주처 요구사항이 이 문구를 명시하고 있어 채택했고, 열거 방어는 rate limit
 * (IP + 시공ID 2차원) 이 담당한다.
 *
 * 형식 오류와 미존재에 **같은 문구**를 쓰는 것은 유지한다 — 다르게 주면 "유효한 시공ID 형식"
 * 까지 추가로 노출되어 대입 범위를 좁혀준다.
 * 문구는 `/api/auth/password-reset/request`(판매점·일반) 와 동일하게 맞춘다.
 */
const NOT_FOUND_MESSAGE = "一致する会員情報がありません。\n入力情報を再度ご確認ください。";

/**
 * POST /api/auth/seko/password-reset/check — 시공점 비밀번호 초기화 1단계 (시공ID 존재 확인)
 *
 * 시공점 전용. 판매점·일반이 쓰는 `/api/auth/password-reset/*` 3종은 흐름(이메일 토큰)이
 * 달라 **수정하지 않고** 본 라우트를 신설했다 — 공유 경로에 분기를 넣으면 회귀 위험이 전이된다.
 *
 * 이 단계는 화면 전환(비밀번호 설정 팝업)을 위한 것이지 인증이 아니다. 2단계(confirm)는
 * 이 응답에 의존하지 않고 스스로 검증하므로, 여기를 우회해도 얻는 것이 없다.
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
      // 형식 오류를 미존재와 다른 문구로 돌려주면 "유효한 시공ID 형식"이 노출된다 → 동일 문구.
      console.warn(
        `${LOG} Zod 검증 실패:`,
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 400 });
    }

    const { sekoId } = parsed.data;

    // Rate limit — 열거 공격 1차 방어선. IP + 시공ID 양쪽 기준.
    // IP 헤더가 없으면 `account:{시공ID}` 로 fallback 하고 한도를 더 엄격하게 적용한다
    // (`unknown-ip` 공용 버킷을 쓰면 한 사용자의 시도가 전체 한도를 소진시킨다).
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    // 시공ID 는 대소문자 표기 차이로 버킷이 갈리지 않도록 정규화해 키에만 쓴다
    // (커넥터로 보내는 값은 입력 원본 유지 — 아래 sekoEmailCheck 인자).
    const idKey = sekoId.toLowerCase();
    if (!checkRateLimit(`seko-pw-reset-check:${ip ?? `account:${idKey}`}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — 시공ID 기반 rate limit 적용`);
    }

    // AS-IS Connector No.8 email/check — 요청 파라미터는 loginId 단독이다.
    // 시공점 로그인 폼이 「メール or 施工ID」를 모두 받으므로 시공ID 도 loginId 로 통한다.
    const result = await sekoEmailCheck(sekoId, LOG);

    if (!result.ok) {
      // 커넥터 장애·설정 오류를 미존재(404)로 뭉개면 사용자가 맞는 시공ID 를 반복 입력하다
      // rate limit 에 걸린다. 재시도 가능한 장애로 구분해 응답한다.
      console.error(`${LOG} SEKO 회원 존재확인 실패 — status=${result.error.status}`);
      return NextResponse.json(
        { error: "外部サーバーに接続できません。しばらくしてからお試しください。" },
        { status: 502 },
      );
    }

    if (!result.data.exists) {
      console.warn(`${LOG} SEKO 회원 미존재`);
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }

    return NextResponse.json({ data: { verified: true } });
  } catch (error) {
    // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 일반 500 에 흡수되면 운영자가 env 누락을 코드 버그와 구분할 수 없다.
    if (error instanceof ConfigError) {
      console.error(`${LOG} 설정 에러:`, error.name, "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요");
      return NextResponse.json(
        { error: "サーバー設定エラーが発生しました" },
        { status: 500 },
      );
    }
    console.error(LOG, error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
