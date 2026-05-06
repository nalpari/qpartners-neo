import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { passwordResetRequestSchema } from "@/lib/schemas/password-reset";
import {
  qspUserDetailResponseSchema,
  type QspUserDetail,
} from "@/lib/schemas/mypage";
import type { UserTp } from "@/lib/schemas/common";
import { sendMail } from "@/lib/mailer";
import {
  passwordResetMailHtml,
  PASSWORD_RESET_SUBJECT,
} from "@/lib/mail-templates/password-reset";
import { SITE_DEFAULTS, QSP_API } from "@/lib/config";
import { fetchWithLog, maskEmail } from "@/lib/interface-logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  generateRawResetToken,
  hashResetToken,
} from "@/lib/password-reset-token";

const LOG = "[POST /api/auth/password-reset/request]";
const QSP_TIMEOUT_MS = 10_000;

// QSP /user/detail 단건 조회 결과 분류 (Redmine #2156 — userTp 별 검증 분기에서 사용)
type LookupOutcome =
  | { kind: "found"; detail: QspUserDetail }
  | { kind: "not-found" }
  | { kind: "ambiguous" } // resultCode "E" — TooManyResultsException 등 다건 매칭
  | { kind: "transport-error" }
  | { kind: "schema-error" }
  | { kind: "aborted" };

/**
 * QSP `/user/detail` 단건 조회 — password-reset 흐름 전용.
 *
 * 호출자가 (loginId | email) 중 하나만 키로 지정한다. mapper 의 email 우선 매칭
 * 동작에 의존하지 않도록 호출 단위에서 키 단독으로 보낸다 (Redmine #2156).
 *
 * 응답의 `data.email` 평문은 STORE 사후 매칭에 사용된다 (BC_QP_USER 의 e_mail 컬럼은
 * 암호화 저장이지만 QSP API 가 응답 시 복호화해 평문으로 내려준다 — 2026-05-06 검증).
 */
async function lookupQspUserForReset(
  params: { loginId?: string; email?: string; userTp: UserTp },
  logSuffix: string,
  externalSignal?: AbortSignal,
): Promise<LookupOutcome> {
  const qsp = new URLSearchParams({
    accsSiteCd: SITE_DEFAULTS.accsSiteCd,
    userTp: params.userTp,
  });
  if (params.loginId) qsp.set("loginId", params.loginId);
  if (params.email) qsp.set("email", params.email);

  const signals: AbortSignal[] = [AbortSignal.timeout(QSP_TIMEOUT_MS)];
  if (externalSignal) signals.push(externalSignal);
  const signal = AbortSignal.any(signals);

  let qspResponse: Response;
  try {
    qspResponse = await fetchWithLog(
      `${QSP_API.userDetail}?${qsp.toString()}`,
      { method: "GET", cache: "no-store", signal },
      {
        system: "QSP",
        direction: "OUTBOUND",
        apiName: "userDetail",
        callerRoute: `${LOG}${logSuffix}`,
        userId: maskEmail(params.email ?? params.loginId ?? ""),
        userType: params.userTp,
      },
    );
  } catch (error) {
    if (externalSignal?.aborted) {
      // race winner 가 abort 시킨 경우 — 정상 fast-path
      return { kind: "aborted" };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`${LOG}${logSuffix} QSP timeout`);
      return { kind: "transport-error" };
    }
    console.error(`${LOG}${logSuffix} QSP 호출 실패:`, error);
    return { kind: "transport-error" };
  }

  if (externalSignal?.aborted) return { kind: "aborted" };

  if (!qspResponse.ok) {
    console.error(`${LOG}${logSuffix} QSP 비정상 응답:`, qspResponse.status);
    return { kind: "transport-error" };
  }

  let qspBody: unknown;
  try {
    qspBody = await qspResponse.json();
  } catch (parseError) {
    if (externalSignal?.aborted) return { kind: "aborted" };
    console.error(`${LOG}${logSuffix} QSP 응답 JSON 파싱 실패:`, parseError);
    return { kind: "schema-error" };
  }

  const parsed = qspUserDetailResponseSchema.safeParse(qspBody);
  if (!parsed.success) {
    if (externalSignal?.aborted) return { kind: "aborted" };
    console.error(
      `${LOG}${logSuffix} QSP 응답 스키마 불일치:`,
      parsed.error.issues,
    );
    return { kind: "schema-error" };
  }

  const resultCode = parsed.data.result.resultCode;
  if (resultCode === "S" && parsed.data.data) {
    return { kind: "found", detail: parsed.data.data };
  }
  if (resultCode === "F_NOT_USER" || (resultCode === "S" && !parsed.data.data)) {
    return { kind: "not-found" };
  }
  if (resultCode === "E") {
    // TooManyResultsException — 동일 키로 다건 매칭. 정확 판정 불가 → fail-closed.
    console.error(
      `${LOG}${logSuffix} QSP 다건 매칭 (resultCode=E) — userTp=${params.userTp}`,
    );
    return { kind: "ambiguous" };
  }
  console.error(
    `${LOG}${logSuffix} QSP 비즈니스 에러 — resultCode=${resultCode}`,
  );
  return { kind: "transport-error" };
}

// POST /api/auth/password-reset/request — 비밀번호 초기화 요청 (메일 발송)
export async function POST(request: NextRequest) {
  try {
    // 1. Request body 파싱 + Zod 검증
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn(`${LOG} Request body 파싱 실패:`, error);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = passwordResetRequestSchema.safeParse(body);
    if (!result.success) {
      // Issue #2156 — 입력 형식 오류·필수 누락 등 모든 검증 실패는 회원 미존재와 동일한 안내 메시지로 통일.
      // (테스터 의도: 사용자가 형식 오류 vs 미존재 케이스를 구분하지 못하도록 일관된 메시지 노출)
      console.warn(
        `${LOG} Zod 검증 실패:`,
        result.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      );
      return NextResponse.json(
        {
          error:
            "一致する会員情報がありません。入力情報を再度ご確認ください。",
        },
        { status: 400 },
      );
    }

    const { userTp, email, loginId } = result.data;

    // 2-a. IP 기반 rate limiting — 열거 공격 방어 (토큰 미생성 이메일도 제한)
    // [전제] 배포 환경의 리버스 프록시(Nginx/ALB)가 클라이언트 x-forwarded-for를 덮어씀.
    //        프록시 없이 직접 노출 시 클라이언트가 헤더를 스푸핑할 수 있으므로
    //        이메일/입력값 기반 rate limit(2-b)이 최종 방어선 역할을 함.
    const forwarded = request.headers.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
    // rate limit 키 — 입력 식별자 (email 우선, 없으면 loginId).
    // GENERAL 의 loginId 입력 케이스에서도 입력값 기준으로 일관되게 카운트.
    const rateLimitKey = (email ?? loginId ?? "").trim();
    // IP 없으면 입력 식별자 기반 fallback — 공용 버킷 차단 회피
    const ipKey = ip ?? `account:${rateLimitKey}`;
    if (!checkRateLimit(`pw-reset:${ipKey}`, ip ? 10 : 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        {
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        },
        { status: 429 },
      );
    }
    if (!ip) {
      console.warn(
        `${LOG} IP 헤더 없음 — 입력 식별자 기반 rate limit 적용`,
      );
    }

    // 2-b. Rate limiting — 동일 입력 식별자 시간당 3건 제한 (토큰 생성 기준)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let recentCount: number;
    try {
      recentCount = await prisma.passwordResetToken.count({
        where: {
          userId: rateLimitKey,
          createdAt: { gte: oneHourAgo },
        },
      });
    } catch (error) {
      console.error(`${LOG} rate limit 조회 실패:`, error);
      return NextResponse.json(
        {
          error:
            "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。",
        },
        { status: 500 },
      );
    }

    if (recentCount >= 3) {
      return NextResponse.json(
        {
          error:
            "しばらく経ってから再度お試しください。（1時間以内の送信回数上限）",
        },
        { status: 429 },
      );
    }

    // 3. QSP /user/detail 회원 존재 확인 — Redmine #2156 userTp 분기 적용
    //
    //    STORE   : loginId 단독 조회 → 응답 email 평문이 입력 email 과 일치할 때만 통과 (AND)
    //    SEKO    : email 단독 조회 → hit 시 통과
    //    GENERAL : 입력값 X 를 loginId 단독 / email 단독으로 dual-key 병렬 조회
    //              어느 한쪽이라도 hit 시 통과 (OR). race + AbortController 로 hang 회피.
    let resolvedDetail: QspUserDetail | null = null;
    let lookupBlocker:
      | "mismatch"
      | "ambiguous"
      | "transport"
      | "schema"
      | null = null;

    if (userTp === "STORE") {
      // loginId/email 모두 존재함이 Zod 로 보장됨
      const r = await lookupQspUserForReset(
        { loginId: loginId!, userTp: "STORE" },
        " (lookup STORE)",
      );
      if (r.kind === "found") {
        if (r.detail.email && r.detail.email === email) {
          resolvedDetail = r.detail;
        } else {
          // loginId 는 매칭됐으나 입력 email 과 불일치 → fail-closed
          console.warn(`${LOG} STORE email mismatch — userTp=STORE`);
          lookupBlocker = "mismatch";
        }
      } else if (r.kind === "ambiguous") {
        lookupBlocker = "ambiguous";
      } else if (r.kind === "transport-error") {
        lookupBlocker = "transport";
      } else if (r.kind === "schema-error") {
        lookupBlocker = "schema";
      }
    } else if (userTp === "SEKO") {
      const r = await lookupQspUserForReset(
        { email: email!, userTp: "SEKO" },
        " (lookup SEKO)",
      );
      if (r.kind === "found" && r.detail.email) {
        resolvedDetail = r.detail;
      } else if (r.kind === "found" && !r.detail.email) {
        // 정상 회원이지만 응답 email 평문 부재 → 메일 발송 불가, fail-closed
        console.error(
          `${LOG} SEKO 응답 data.email 부재 — 메일 발송 불가, fail-closed`,
        );
        lookupBlocker = "mismatch";
      } else if (r.kind === "ambiguous") {
        lookupBlocker = "ambiguous";
      } else if (r.kind === "transport-error") {
        lookupBlocker = "transport";
      } else if (r.kind === "schema-error") {
        lookupBlocker = "schema";
      }
    } else if (userTp === "GENERAL") {
      // 입력값 X — loginId 우선, 없으면 email (Zod 가 둘 중 하나는 보장)
      const inputValue = (loginId ?? email ?? "").trim();
      const ac = new AbortController();
      const p1 = lookupQspUserForReset(
        { loginId: inputValue, userTp: "GENERAL" },
        " (lookup GENERAL #1 loginId)",
        ac.signal,
      );
      const p2 = lookupQspUserForReset(
        { email: inputValue, userTp: "GENERAL" },
        " (lookup GENERAL #2 email)",
        ac.signal,
      );
      const first = await Promise.race([p1, p2]);
      if (first.kind === "found" && first.detail.email) {
        ac.abort();
        resolvedDetail = first.detail;
      } else {
        const [r1, r2] = await Promise.all([p1, p2]);
        const winner =
          r1.kind === "found" && r1.detail.email
            ? r1
            : r2.kind === "found" && r2.detail.email
              ? r2
              : null;
        if (winner) {
          resolvedDetail = winner.detail;
        } else if (r1.kind === "ambiguous" || r2.kind === "ambiguous") {
          lookupBlocker = "ambiguous";
        } else if (
          r1.kind === "transport-error" ||
          r2.kind === "transport-error"
        ) {
          lookupBlocker = "transport";
        } else if (r1.kind === "schema-error" || r2.kind === "schema-error") {
          lookupBlocker = "schema";
        }
      }
    }
    // ADMIN 또는 정의되지 않은 userTp — 분기 어디에도 진입하지 못해 resolvedDetail 가 null →
    // 아래의 not-found 분기에서 404 처리 (fail-closed).

    // transport / schema 블록은 외부 시스템 장애 — 502 로 분리
    if (lookupBlocker === "transport" || lookupBlocker === "schema") {
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました。" },
        { status: 502 },
      );
    }

    // not-found / mismatch / ambiguous → 404 (사용자 열거 방어 위해 동일 메시지)
    if (!resolvedDetail || !resolvedDetail.email) {
      console.info(
        `${LOG} 회원 미존재/매칭실패 — userTp=${userTp}, blocker=${lookupBlocker ?? "not-found"}`,
      );
      return NextResponse.json(
        {
          error:
            "一致する会員情報がありません。入力情報を再度ご確認ください。",
        },
        { status: 404 },
      );
    }

    // 4. 기존 미사용 토큰 무효화 + 새 토큰 생성 (트랜잭션)
    //    토큰의 userId 는 매칭 회원의 평문 email 로 통일 — verify/confirm 라우트가 email 기준 조회.
    const resolvedEmail = resolvedDetail.email;
    const resolvedLoginId = resolvedDetail.userId;
    const rawToken = generateRawResetToken();
    const token = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

    try {
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: resolvedEmail, used: false },
          data: { used: true },
        }),
        prisma.passwordResetToken.create({
          data: {
            userType: userTp,
            userId: resolvedEmail,
            loginId: resolvedLoginId,
            token,
            expiresAt,
          },
        }),
      ]);
    } catch (error) {
      console.error(`${LOG} 토큰 생성 실패:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました。" },
        { status: 500 },
      );
    }

    // 5. 비밀번호 변경 링크 메일 발송 — 수신자는 매칭 회원의 평문 email
    const siteUrl = process.env.SITE_URL ?? SITE_DEFAULTS.url;
    const resetUrl = `${siteUrl}/password-reset?token=${rawToken}`;

    try {
      await sendMail({
        to: resolvedEmail,
        subject: PASSWORD_RESET_SUBJECT,
        html: passwordResetMailHtml({ resetUrl }),
      });
    } catch (error) {
      console.error(
        `${LOG} 메일 발송 실패`,
        error instanceof Error ? { message: error.message } : error,
      );
      // 토큰 삭제 (rate limit 미소모 — count 쿼리에서 제외)
      await prisma.passwordResetToken
        .deleteMany({ where: { token } })
        .catch((dbError: unknown) => {
          console.error(
            `${LOG} 토큰 롤백 실패 — orphan 토큰 잔류, tokenHashPrefix:`,
            token.slice(0, 8),
            dbError,
          );
        });
      return NextResponse.json(
        {
          error:
            "メールの送信に失敗しました。しばらくしてからもう一度お試しください。",
        },
        { status: 500 },
      );
    }

    // 6. 성공 응답
    return NextResponse.json({
      data: { message: "パスワード変更リンクをメールで送信しました。" },
    });
  } catch (error) {
    console.error(LOG, error);
    return NextResponse.json(
      { error: "パスワード初期化処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
