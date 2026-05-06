import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetVerifySchema } from "@/lib/schemas/password-reset";
import { hashResetToken } from "@/lib/password-reset-token";
import { checkRateLimit } from "@/lib/rate-limit";
import { maskEmail } from "@/lib/interface-logger";

// POST /api/auth/password-reset/verify — 토큰 검증
export async function POST(request: NextRequest) {
  try {
    // 1. Request body 파싱 + Zod 검증
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("[POST /api/auth/password-reset/verify] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストの形式が正しくありません。" },
        { status: 400 },
      );
    }

    const result = passwordResetVerifySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "リクエストの形式が正しくありません。" },
        { status: 400 },
      );
    }

    const { token: rawToken } = result.data;

    // 2. Rate limit — IP 기반 (token 단일 탈취 시 무한 호출로 email enumerate 차단)
    //    [전제] 배포 환경의 리버스 프록시(Nginx/ALB) 가 클라이언트 x-forwarded-for 를 덮어씀.
    //    프록시 없이 직접 노출 시 헤더 스푸핑 가능하므로 token 해시 prefix 기반 보조 키 + 단일 공용
    //    버킷도 함께 적용 — 다수 토큰 보유 공격자가 prefix 별로 카운터를 분산해 우회하는 패턴 차단.
    //    [보안] rawToken 원문 대신 hashResetToken 결과 prefix 를 사용 — 메모리 덤프/로그 유출 시
    //    rate limit 키에서 원본 토큰 일부가 역추출되는 채널 차단.
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    if (ip) {
      if (!checkRateLimit(`pw-verify:ip:${ip}`, 30, 60 * 60 * 1000)) {
        return NextResponse.json(
          { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
          { status: 429 },
        );
      }
    } else {
      // IP 부재 시: token 해시 prefix 별 5회 + 공용 버킷 50회 동시 적용 (다수 토큰 분산 우회 차단)
      const tokenHashPrefix = hashResetToken(rawToken).slice(0, 16);
      const ok =
        checkRateLimit(`pw-verify:tp:${tokenHashPrefix}`, 5, 60 * 60 * 1000) &&
        checkRateLimit("pw-verify:no-ip", 50, 60 * 60 * 1000);
      if (!ok) {
        return NextResponse.json(
          { error: "リクエストが多すぎます。しばらく経ってから再度お試しください。" },
          { status: 429 },
        );
      }
      console.warn("[POST /api/auth/password-reset/verify] IP 헤더 없음 — token hash prefix + 공용 버킷 rate limit 적용");
    }

    // DB에는 SHA-256 해시가 저장되어 있음 — 입력 토큰을 해싱 후 조회
    const tokenHash = hashResetToken(rawToken);

    // 3. DB에서 토큰 조회
    let resetToken;
    try {
      resetToken = await prisma.passwordResetToken.findUnique({
        where: { token: tokenHash },
      });
    } catch (error) {
      console.error("[POST /api/auth/password-reset/verify] DB 조회 실패:", error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。" },
        { status: 500 },
      );
    }

    // 4. 유효성 검증 — 미존재/만료 모두 동일 메시지 (사용자 열거 방어)
    if (!resetToken) {
      return NextResponse.json(
        { error: "無効または期限切れのリンクです。" },
        { status: 400 },
      );
    }

    // used / expired 모두 동일 메시지 — 토큰 상태(=비밀번호 변경 완료 여부) 를 응답으로 구분 불가하게 차단.
    if (resetToken.used || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "無効または期限切れのリンクです。" },
        { status: 400 },
      );
    }

    // 5. 유효한 토큰 — popup 의 read-only 표시용으로 마스킹된 email 함께 반환.
    //    토큰 1건 유출 시 verify 무한 호출로 email 평문 enumerate 되는 것을 방지하기 위해
    //    `c***@interplug.co.kr` 형태로 부분 마스킹. 사용자 본인은 메일을 받은 시점에 자기 주소를
    //    이미 알고 있으므로 마스킹된 형태만으로도 read-only UX 가 성립한다.
    //    userType 은 클라이언트에서 사용하지 않으므로 토큰 회원유형 추론 채널 차단을 위해 제외.
    return NextResponse.json({
      data: {
        valid: true,
        email: maskEmail(resetToken.userId),
      },
    });
  } catch (error) {
    console.error("[POST /api/auth/password-reset/verify]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 },
    );
  }
}
