import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { sekoPasswordResetConfirmSchema } from "@/lib/schemas/password-reset";
import { sekoResetPwd } from "@/lib/seko-connector";

const LOG = "[POST /api/auth/seko/password-reset/confirm]";

/**
 * POST /api/auth/seko/password-reset/confirm — 시공점 비밀번호 초기화 2단계 (신규 비밀번호 저장)
 *
 * 시공점 전용. 판매점·일반의 `/api/auth/password-reset/confirm` 은 일회용 토큰을 소비하지만,
 * 시공점은 토큰 단계가 없어(수신 메일 주소를 얻을 수 없는 AS-IS 제약) **시공ID + 신규 비밀번호**
 * 만으로 저장한다.
 *
 * ⚠️ 따라서 이 엔드포인트는 1단계(check) 통과 여부와 무관하게 **단독으로 비밀번호를 바꿀 수
 * 있다**. 이는 「즉시 팝업」요구사항에서 불가피한 잔존 위험(이메일 소유 증명 없음)이며,
 * rate limit 이 유일한 방어선이므로 check 보다 한도를 좁게 잡는다.
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

    const parsed = sekoPasswordResetConfirmSchema.safeParse(body);
    if (!parsed.success) {
      // 비밀번호 정책·불일치는 사용자가 고칠 수 있어야 하므로 필드 메시지를 그대로 돌려준다.
      // (시공ID 관련 issue 는 존재 여부를 노출하지 않는다 — 형식 오류일 뿐이다.)
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      console.warn(`${LOG} Zod 검증 실패:`, issues);
      return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
    }

    const { sekoId, newPassword } = parsed.data;

    // Rate limit — 이 라우트가 비밀번호 변경의 유일한 관문이므로 check(10/5) 보다 좁게 잡는다.
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    const idKey = sekoId.toLowerCase();
    if (!checkRateLimit(`seko-pw-reset-confirm:${ip ?? `account:${idKey}`}`, ip ? 5 : 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(`${LOG} IP 헤더 없음 — 시공ID 기반 rate limit 적용`);
    }

    // AS-IS Connector No.10 resetPwd — Bearer·현재 비밀번호 모두 불요(X-Api-Key).
    // 존재하지 않는 시공ID 는 커넥터가 거부하므로 여기서 별도 존재확인(No.8)을 다시 하지 않는다
    // (호출 1회·로그 1행 절약. 1단계 결과를 신뢰하지 않는다는 점도 그대로 유지된다).
    const result = await sekoResetPwd(sekoId, newPassword, LOG);

    if (!result.ok) {
      if (result.indeterminate) {
        // 타임아웃·응답 파싱 실패 — 커넥터가 이미 비밀번호를 바꾼 뒤 응답만 유실됐을 수 있다.
        // 실패로 단정하면 사용자가 "안 바뀌었다"고 믿게 되므로 확인을 유도하는 문구로 돌려준다.
        console.error(`${LOG} SEKO 비밀번호 재설정 결과 불명 — status=${result.error.status}`);
        return NextResponse.json(
          {
            error:
              "処理結果を確認できませんでした。新しいパスワードでログインできない場合は、もう一度お試しください。",
          },
          { status: 502 },
        );
      }
      // 커넥터가 명시적으로 거부 — 시공ID 미존재/계정 상태 이상 등.
      // 사유를 특정하면 계정 상태까지 노출되므로 1단계(check)와 동일 문구로 접는다.
      console.warn(
        `${LOG} SEKO 비밀번호 재설정 거부 — status=${result.error.status}, errorCode=${result.error.errorCode ?? "-"}`,
      );
      return NextResponse.json(
        { error: "一致する会員情報がありません。\n入力情報を再度ご確認ください。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: { updated: true } });
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
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
