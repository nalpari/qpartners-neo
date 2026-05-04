# 로그인 알림 + 속성정보 변경 알림 Design Document

> **Summary**: 회원관리 알림 설정(`loginNotiYn` / `attrChgYn`) 유효 회원에게 로그인·속성변경 시점에 알림 메일 자동 발송. v0.1 에서 **속성 변경 알림** 을 implementation-ready 수준으로 설계 → 구현 완료. v0.2 에서 **로그인 알림** 을 implementation-ready 수준으로 보강 (Redmine #2125 / Q1~Q3 결정 반영).
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-27 (v0.1) / 2026-05-04 (v0.2)
> **Status**: Draft v0.2 — 로그인 알림 implementation-ready
> **Planning Doc**: [login-attr-notification.plan.md](../../01-plan/features/login-attr-notification.plan.md)
> **화면설계서**: p.47 #6 (로그인 알림), p.47 #7 (속성변경 알림)
> **연관 이슈**: Redmine #2125 (로그인 알림받기 미구현)

---

## 1. Architecture

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Trigger Endpoints                        │
├─────────────────────────────────────────────────────────────┤
│ PUT  /api/mypage/profile   ── (속성 변경 알림 트리거) ✅      │
│ POST /api/auth/login       ── (로그인 알림 트리거)    🟡 v0.2│
│ POST /api/auth/auto-login/inbound ── (Q3: 발송 제외) 🚫       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         src/lib/notification-mail/  (신규 모듈)               │
├─────────────────────────────────────────────────────────────┤
│ ├ constants.ts          (제목·From·Bcc 상수) ✅                │
│ ├ field-labels.ts       (TO-BE 필드 → 일본어 라벨 매핑) ✅     │
│ ├ attr-change-mail.ts   (속성 변경 메일 빌더 + 발송 헬퍼) ✅   │
│ ├ login-mail.ts         (로그인 알림 메일 빌더) 🟡 v0.2        │
│ ├ utils.ts              (IP 추출 / JST 일시 포매터) 🟡 v0.2    │
│ └ send-notification.ts  (Bcc 가드 + fail-safe 발송 래퍼) ✅    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              src/lib/mailer.ts (확장)                        │
├─────────────────────────────────────────────────────────────┤
│ - SendMailOptions 에 bcc?: string | string[] 옵션 추가        │
│ - transporter.sendMail 호출 시 bcc 전달                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       [SMTP 발송]
```

### 1.2 속성 변경 알림 데이터 흐름

```
[Client — 마이페이지 정보 변경 제출]
    │  PUT /api/mypage/profile { sei, mei, ..., newsRcptYn }
    ▼
[변경 직전 QSP userDetail 조회]
    │  fetchQspUserDetail(userId, userTp)
    │  ─────────────────────────────────
    │  ※ ADMIN/STORE 는 이미 호출 중
    │  ※ GENERAL 도 추가 호출 필요 (변경 전 값 + attrChgYn 확보)
    ▼
[QSP updateUserDtl 호출 → 성공 (resultCode === "S")]
    │
    ▼
[attrChgYn === "Y" 분기]
    │
    ├── N / null → return (메일 발송 X)
    │
    └── Y →
          [diff 계산: preDetail vs request 값]
              │  변경된 필드만 추출
              │  회사정보 vs 회원정보 섹션 분류 (field-labels.ts)
              ▼
          [본문 빌드: AS-IS edit_user.txt 양식]
              ▼
          [send-notification.ts → mailer.sendMail({ to, bcc, subject, html })]
              │
              ├── 성공 → console.log + return (본 API 응답 무영향)
              └── 실패 → console.warn + return (본 API 200 정상 응답 유지)
```

---

## 2. mailer.ts 확장

### 2.1 SendMailOptions 변경

```ts
// src/lib/mailer.ts
interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  bcc?: string | string[];          // ★ 신규
  attachments?: SendMailAttachment[];
}

export async function sendMail({ to, subject, html, bcc, attachments }: SendMailOptions): Promise<SendMailResult> {
  // ... 기존 로직 ...
  rawInfo = await transporter.sendMail({
    from: `${SMTP_DEFAULTS.fromName} <${from}>`,
    to,
    subject,
    html,
    ...(bcc !== undefined ? { bcc } : {}),                        // ★ 신규
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
  // ... 기존 로직 ...
}
```

### 2.2 영향 범위

| 호출자 | 영향 |
|--------|------|
| `password-reset/request` | 무영향 (bcc 미사용) |
| `two-factor/send` | 무영향 |
| `mass-mail/send-processor` | 무영향 |
| `notification-mail/*` | 신규 사용 |

옵셔널 필드 추가이므로 backward-compatible.

---

## 3. notification-mail 모듈 설계

### 3.1 `constants.ts`

```ts
// src/lib/notification-mail/constants.ts

/** 운영 주체 BCC — AS-IS const_mail.php 미러링 */
export const NOTIFICATION_MAIL_BCC = [
  "hasegawa.j@qcells.com",
  "q-partners@hqj.co.jp",
] as const;

/** 속성 변경 알림 제목 */
export const ATTR_CHANGE_MAIL_SUBJECT = "【Q.PARTNERS】会員情報変更完了のお知らせ";

/** 로그인 알림 제목 — Redmine #2125 확정 (2026-05-04) */
export const LOGIN_NOTIFICATION_MAIL_SUBJECT = "【Q.PARTNERS】ログインのお知らせ";
```

> **v0.2 변경**: 코드상 현재 값 `"ログイン通知"` (placeholder) → `"ログインのお知らせ"` 로 정정 필요. 이 상수는 v0.1 시점에는 export 만 되고 미사용 상태였음.

> From 주소는 `mailer.ts` 가 환경변수 `SMTP_FROM` 또는 `SMTP_DEFAULTS.from` 을 사용. 본 모듈에서 별도 지정 X.

### 3.2 `field-labels.ts`

AS-IS `dbword.ini` → TO-BE `profileUpdateSchema` 필드명 매핑.

```ts
// src/lib/notification-mail/field-labels.ts

/** 회사정보 변경 항목 (●会社情報変更 섹션) */
export const COMPANY_FIELD_LABELS: Record<string, string> = {
  compNm: "会社名",
  compNmKana: "会社名フリガナ",
  zipcode: "郵便番号",
  address1: "市区町村",
  address2: "以降の住所",
  telNo: "電話番号",
  fax: "FAX番号",
  corporateNo: "法人番号",
};

/** 회원정보 변경 항목 (●会員情報変更 섹션) */
export const USER_FIELD_LABELS: Record<string, string> = {
  sei: "氏名(姓)",
  mei: "氏名(名)",
  seiKana: "フリガナ(姓)",
  meiKana: "フリガナ(名)",
  department: "部署",
  jobTitle: "役職",
  newsRcptYn: "ニュースレター受信",
};

/** profileUpdateSchema 전체 필드 — diff 계산 시 순회 대상 */
export const TRACKABLE_FIELDS = [
  ...Object.keys(COMPANY_FIELD_LABELS),
  ...Object.keys(USER_FIELD_LABELS),
] as const;
```

> **주의**: 변경 항목이 매핑 테이블에 없으면 본문에 포함하지 않고 `console.warn` 으로 추적. 향후 신규 필드 추가 시 매핑 누락을 빠르게 발견하기 위함.

### 3.3 `send-notification.ts`

```ts
// src/lib/notification-mail/send-notification.ts
import { sendMail } from "@/lib/mailer";
import { NOTIFICATION_MAIL_BCC } from "./constants";

interface SendNotificationOptions {
  to: string;
  subject: string;
  html: string;
  callerRoute: string;          // 로깅용 prefix
}

/**
 * 알림 메일 공통 발송 헬퍼.
 * - dev/staging 환경에서 운영 BCC 차단 (mass-mail-test-redirect 와 동일 정책)
 * - 발송 실패는 warn 로깅만, throw 하지 않음 (호출부 본 API 응답 무영향)
 */
export async function sendNotificationMail(opts: SendNotificationOptions): Promise<void> {
  const isProd = process.env.APP_ENV === "production";
  const bcc = isProd ? [...NOTIFICATION_MAIL_BCC] : undefined;

  try {
    const result = await sendMail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(bcc ? { bcc } : {}),
    });
    console.log(`${opts.callerRoute} 알림 메일 발송 완료`, {
      ethereal: result.ethereal,
      bccApplied: !!bcc,
    });
  } catch (error) {
    console.warn(`${opts.callerRoute} 알림 메일 발송 실패 (응답 무영향)`, error);
  }
}
```

> **dev BCC 차단 근거**:
> - `hasegawa.j@qcells.com` / `q-partners@hqj.co.jp` 는 운영 주체 실주소
> - dev 에서 ethereal 미사용 + 실 SMTP 연결될 경우 운영 측에 잘못된 메일 도달 위험
> - `mailer.ts` 가 ethereal 사용 중이면 어차피 발송 안 되지만 defense-in-depth

### 3.4 `attr-change-mail.ts`

```ts
// src/lib/notification-mail/attr-change-mail.ts
import { ATTR_CHANGE_MAIL_SUBJECT } from "./constants";
import { COMPANY_FIELD_LABELS, USER_FIELD_LABELS } from "./field-labels";
import { sendNotificationMail } from "./send-notification";
import type { ProfileUpdateInput } from "@/lib/schemas/mypage";
import type { QspUserDetail } from "@/lib/schemas/mypage";

const SITE_URL_FALLBACK = "https://q-partners.hqj.co.jp";

interface AttrChangeMailContext {
  to: string;                                          // 회원 본인 이메일
  recipientName: { sei: string; mei: string };        // 본문 인사말
  preDetail: QspUserDetail;                            // 변경 전 QSP 값
  request: ProfileUpdateInput;                         // 변경 요청 값
  callerRoute: string;
}

/** 변경된 필드 목록 추출 (변경 전 vs 요청 비교) */
function diffFields(
  preDetail: QspUserDetail,
  request: ProfileUpdateInput,
  labelMap: Record<string, string>,
): string[] {
  const lines: string[] = [];

  for (const [fieldName, label] of Object.entries(labelMap)) {
    const requestValue = (request as Record<string, unknown>)[fieldName];

    // request 에 값이 없으면 변경 의도 없음 (빈 문자열 default 값은 schema 의 default → 변경 의도 분리 불가)
    // → preDetail 과 비교해 실제로 다를 때만 변경 처리
    if (requestValue === undefined || requestValue === null) continue;

    const preValue = mapPreFieldValue(preDetail, fieldName);
    if (normalizeValue(preValue) === normalizeValue(requestValue)) continue;

    lines.push(`${label} : ${formatValue(requestValue)}`);
  }

  return lines;
}

/** TO-BE 필드명 → preDetail 의 QSP 필드명 매핑 */
function mapPreFieldValue(preDetail: QspUserDetail, toBeField: string): unknown {
  switch (toBeField) {
    case "sei": return preDetail.user2ndNm;
    case "mei": return preDetail.user1stNm;
    case "seiKana": return preDetail.user2ndNmKana;
    case "meiKana": return preDetail.user1stNmKana;
    case "compNm": return preDetail.compNm;
    case "compNmKana": return preDetail.compNmKana;
    case "zipcode": return preDetail.compPostCd;
    case "address1": return preDetail.compAddr;
    case "address2": return preDetail.compAddr2;
    case "telNo": return preDetail.compTelNo;
    case "fax": return preDetail.compFaxNo;
    case "department": return preDetail.deptNm;
    case "jobTitle": return preDetail.pstnNm;
    case "corporateNo": return preDetail.corporateNo;
    case "newsRcptYn": return preDetail.newsRcptYn;
    default:
      console.warn(`[attr-change-mail] preDetail 매핑 누락: ${toBeField}`);
      return undefined;
  }
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * AS-IS edit_user.txt 양식 미러링한 HTML 본문 생성.
 * Plain text 양식을 HTML 로 변환 (escape + <br> 치환).
 */
function buildBodyHtml(args: {
  recipientName: { sei: string; mei: string };
  companyChanges: string[];
  userChanges: string[];
  siteUrl: string;
}): string {
  const lines: string[] = [];
  lines.push("※本メールは「Q.PARTNERS」をご利用いただく際の重要な情報を記載しておりますので、大切に保存していただきますようお願いいたします。");
  lines.push("");
  lines.push(`${escapeHtml(args.recipientName.sei)}　${escapeHtml(args.recipientName.mei)}様`);
  lines.push("");
  lines.push("いつも「Q.PARTNERS」をご利用いただきまして、誠にありがとうございます。");
  lines.push("以下の登録情報の変更が完了しましたので、以下にご連絡いたします。");
  lines.push("");
  lines.push("●会社情報変更");
  if (args.companyChanges.length > 0) {
    args.companyChanges.forEach((line) => lines.push(escapeHtml(line)));
  }
  lines.push("");
  lines.push("");
  lines.push("●会員情報変更");
  if (args.userChanges.length > 0) {
    args.userChanges.forEach((line) => lines.push(escapeHtml(line)));
  }
  lines.push("");
  lines.push("※メールアドレスを変更された場合は、変更後のメールアドレスがログインIDとなります。");
  lines.push("");
  lines.push("もし本メールの内容に心当たりが無い場合は、大変お手数ですがその旨ご明記のうえ、本メールの内容とともにご返信ください。");
  lines.push("");
  lines.push("お客様の登録情報は、ログイン後「マイページ」にてご確認いただけます。");
  lines.push(`マイページ(URL)：${escapeHtml(args.siteUrl)}/mypage/`);
  lines.push("");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("このメールは、ご登録されたメールアドレス宛に自動的に送信されています。");
  lines.push("本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに");
  lines.push("「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("　ハンファジャパン株式会社");
  lines.push("　Q.PARTNERS事務局");
  lines.push("　Tel:03-5441-5976");
  lines.push("　Email : q-partners@hqj.co.jp");
  lines.push("　問い合わせ受付時間：平日10：00-12：00　13：00-17：00");
  lines.push("※土曜、日曜、祝日にお問合せをいただいた場合は、");
  lines.push("　翌営業日以降に順次対応いたします。");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return `<pre style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; white-space: pre-wrap;">${lines.join("\n")}</pre>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 속성 변경 알림 발송.
 * - 발송 조건은 호출부에서 attrChgYn === "Y" 확인 후 진입
 * - 변경 항목 0건이면 발송 X (본 함수 내 가드)
 */
export async function sendAttrChangeNotification(ctx: AttrChangeMailContext): Promise<void> {
  const companyChanges = diffFields(ctx.preDetail, ctx.request, COMPANY_FIELD_LABELS);
  const userChanges = diffFields(ctx.preDetail, ctx.request, USER_FIELD_LABELS);

  if (companyChanges.length === 0 && userChanges.length === 0) {
    console.log(`${ctx.callerRoute} 변경 항목 없음 — 알림 메일 발송 스킵`);
    return;
  }

  const html = buildBodyHtml({
    recipientName: ctx.recipientName,
    companyChanges,
    userChanges,
    siteUrl: process.env.SITE_URL ?? SITE_URL_FALLBACK,
  });

  await sendNotificationMail({
    to: ctx.to,
    subject: ATTR_CHANGE_MAIL_SUBJECT,
    html,
    callerRoute: ctx.callerRoute,
  });
}
```

### 3.5 `login-mail.ts` (v0.2)

```ts
// src/lib/notification-mail/login-mail.ts
import { sendMail } from "@/lib/mailer";
import { LOGIN_NOTIFICATION_MAIL_SUBJECT } from "./constants";
import { sendNotificationMail } from "./send-notification";

interface LoginNotificationContext {
  /** 회원 본인 이메일 (이 값이 falsy 면 호출부에서 가드해야 함) */
  to: string;
  /** 본문 인사말. null 가능 (`お客様` 폴백) */
  userNm: string | null;
  /** 로그인 시점 (서버 발송 시점). JST 표기. */
  loginAt: Date;
  /** 클라이언트 IP. 추출 불가 시 null → 본문에 `不明` 표기 */
  clientIp: string | null;
  /** 호출부 식별 prefix — 로깅용 */
  callerRoute: string;
}

/** Asia/Tokyo "YYYY/MM/DD HH:mm:ss" 포맷 */
function formatJst(d: Date): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  // ja-JP 기본은 "YYYY/MM/DD HH:MM:SS" 형태 (locale-stable)
  return fmt.format(d);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 로그인 알림 메일 본문 빌드 (Redmine #2125).
 * 풋터는 attr-change-mail.ts 와 동일 — 향후 footer.ts 로 공용화 예정 (Q6).
 */
function buildBodyHtml(args: {
  userNm: string;
  loginAtJst: string;
  ipText: string;
}): string {
  const lines: string[] = [
    `${escapeHtml(args.userNm)}様`,
    "",
    "平素より格別のお引き立てありがとうございます。",
    "以下ログインが確認されましたので、お知らせいたします。",
    "",
    `ログイン日時：${escapeHtml(args.loginAtJst)}`,
    `IPアドレス：${escapeHtml(args.ipText)}`,
    "",
    "お心当たりのない方は、第三者のログインの可能性がありますので、ログインパスワードの再設定をお願い致します。",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "　ハンファジャパン株式会社",
    "　Q.PARTNERS事務局",
    "　Tel:03-5441-5976",
    "　Email : q-partners@hqj.co.jp",
    "　問い合わせ受付時間：平日10：00-12：00　13：00-17：00",
    "※土曜、日曜、祝日にお問合せをいただいた場合は、",
    "　翌営業日以降に順次対応いたします。",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ];
  return `<pre style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; white-space: pre-wrap;">${lines.join("\n")}</pre>`;
}

/**
 * 로그인 알림 발송.
 * 호출부는 `loginNotiYn === "Y" && email` 가드를 통과한 경우만 진입.
 */
export async function sendLoginNotification(ctx: LoginNotificationContext): Promise<void> {
  const html = buildBodyHtml({
    userNm: ctx.userNm?.trim() || "お客様",
    loginAtJst: formatJst(ctx.loginAt),
    ipText: ctx.clientIp ?? "不明",
  });

  await sendNotificationMail({
    to: ctx.to,
    subject: LOGIN_NOTIFICATION_MAIL_SUBJECT,
    html,
    callerRoute: ctx.callerRoute,
  });
}
```

### 3.6 `utils.ts` (v0.2 — 공용 헬퍼)

```ts
// src/lib/notification-mail/utils.ts
import type { NextRequest } from "next/server";

/**
 * 클라이언트 IP 추출 — auto-login/inbound/route.ts 와 동일 정책.
 * 불가 시 null (본문에서는 `不明` 표기).
 */
export function extractClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real?.trim() || null;
}
```

> **로그상 IP 노출 금지**: 본문에는 표기하지만, console.log 시 IP 평문 출력은 금지. 알림 발송 결과 로그(`send-notification.ts:36-40`)에는 IP 자체를 포함하지 않으므로 추가 가드 불필요.

---

## 4. PUT /api/mypage/profile 통합

### 4.1 변경 흐름

기존 코드 (`src/app/api/mypage/profile/route.ts`):
- ADMIN/STORE: `fetchQspUserDetail` 이미 호출 중 → 그대로 활용
- GENERAL: `fetchQspUserDetail` 호출 없음 → **추가 필요**

### 4.2 통합 패치 위치

```ts
// src/app/api/mypage/profile/route.ts (PUT 본체 내)

// ─── 변경 전 detail 확보 (변경 알림용) ───
let preDetail: QspUserDetail | null = null;
try {
  const detailResult = await fetchQspUserDetail(
    user.userId,
    user.userTp,
    "[PUT /api/mypage/profile]",
  );
  if (detailResult.ok) {
    preDetail = detailResult.detail;
  } else {
    // ADMIN/STORE 경로: 기존 그대로 502 응답
    if (user.userTp !== "GENERAL") {
      return NextResponse.json(
        { error: detailResult.error.error },
        { status: detailResult.error.status },
      );
    }
    // GENERAL 경로: detail 조회 실패해도 업데이트는 진행 (기존 동작 유지)
    // 단 알림 발송은 스킵 (preDetail 없으므로 diff 계산 불가)
    console.warn("[PUT /api/mypage/profile] preDetail 조회 실패 — 알림 메일 스킵", {
      ...buildUserLogContext(user),
      error: detailResult.error,
    });
  }
} catch (error) {
  console.warn("[PUT /api/mypage/profile] preDetail 조회 예외 — 알림 메일 스킵", error);
}

// ─── 기존 GENERAL/ADMIN/STORE 분기 (qspPayload 빌드 + QSP 호출) ───
// ※ ADMIN/STORE 분기에서 기존 fetchQspUserDetail 재호출은 제거 → preDetail 재사용
// ※ GENERAL 분기는 기존 그대로 (preDetail 사용 X)

// ─── QSP 업데이트 성공 후 ───
if (preDetail && preDetail.attrChgYn === "Y") {
  // fire-and-forget — 응답 차단 X, 단 try-catch 내부에서 전체 격리
  void sendAttrChangeNotification({
    to: user.email,
    recipientName: { sei: d.sei ?? "", mei: d.mei ?? "" },
    preDetail,
    request: d,
    callerRoute: "[PUT /api/mypage/profile]",
  });
}

return NextResponse.json({ data: { message: "保存されました" } });
```

> **`attrChgYn` 필드 추가**: `qspUserDetailSchema` 에 `attrChgYn: z.enum(["Y", "N"]).nullable()` 추가 필요. 회원관리 API 에서 이미 매핑 중이므로 schema 만 추가하면 됨.

### 4.3 fire-and-forget vs await 정책

| 호출부 | 전략 | 이유 |
|--------|------|------|
| `PUT /api/mypage/profile` | **fire-and-forget (`void`)** | 본 API 응답 지연 방지. 메일 발송 실패는 사용자 응답에 영향 X |
| `POST /api/auth/login` | **fire-and-forget (`void`)** | 로그인 응답 즉시 반환 우선 |

> `sendNotificationMail` 내부에서 try-catch 로 모든 예외 흡수하므로 unhandled rejection 위험 없음.

### 4.4 attrChgYn 발송 결정 시점

- **변경 직전 값 (preDetail.attrChgYn)** 기준
- 즉, 사용자가 같은 트랜잭션 내에서 attrChgYn 을 OFF 로 토글해도 본 변경은 알림 발송됨
- 다음 변경부터 OFF 적용
- 화면설계서가 명시 X — TO-BE 정책으로 결정 (사용자가 인지 못한 변경을 알리는 것이 본 기능 취지)

---

## 5. POST /api/auth/login 통합 (v0.2 확정)

### 5.1 통합 위치
`src/app/api/auth/login/route.ts` 코드 분석:

| 라인 | 분기 | 발송 |
|---|---|---|
| 117–122 | `resultCode !== "S"` → 401 | ❌ 발송 X (실패) |
| 231–240 | 2FA 필요 + email 미등록 → 403 | ❌ 발송 X (1차 자체 실패) |
| 273–282 | JWT 서명 실패 → 500 | ❌ 발송 X |
| **282–292** | **JWT 서명 성공 + `NextResponse.json` 직전** | ✅ **여기가 진입점** |

### 5.2 통합 패치 (의사코드)

```ts
// src/app/api/auth/login/route.ts (생략 — 라인 282 부근)
// ... 기존 token = await signToken(user); 까지 ...

// ★ v0.2 신규 — 로그인 알림 발송 (Redmine #2125)
//   조건: loginNotiYn === "Y" && email 등록됨
//   패턴: fire-and-forget — 응답 차단 X, 실패 시 본 API 무영향
if (qsp.data.loginNotiYn === "Y" && qsp.data.email) {
  void sendLoginNotification({
    to: qsp.data.email,
    userNm: qsp.data.userNm,
    loginAt: new Date(),
    clientIp: extractClientIp(request),
    callerRoute: "[POST /api/auth/login]",
  });
}

// 8. httpOnly 쿠키 설정 ... (기존 그대로)
const response = NextResponse.json({ data: { ...user, ...debugMeta } });
response.cookies.set(...);
return response;
```

### 5.3 schema 보정

`src/lib/schemas/auth.ts` `qspLoginUserSchema` 에 누락된 1줄 추가:

```ts
// auth.ts L42 인근 (secAuthYn 옆)
loginNotiYn: z.enum(["Y", "N"]).nullable(),
```

> Q1 결정 — login API 응답 자체에 `loginNotiYn` 이 포함되어 있음. 별도 `userDetail` 호출 불필요.

### 5.4 발송 시점 정책 (Q2 확정)

- **(A) 1차 로그인 성공 시 즉시 발송** — 2FA 통과 여부 무관, JWT 서명 직후
- **(B) 2FA 완료 후 발송 — 채택 안 함**

근거:
- 본문 사양("ログインが確認されました")은 "본인 인지" 목적 → 1차 성공만으로도 발송하는 게 보안 우위
- 2FA 후로 미루면 공격자가 1차 통과 후 2FA 실패해도 본인은 모름 → 사양 의도 위배
- 1차 성공 후 2FA 실패는 공격자에게 더 유의미한 신호이므로 본인이 메일로 인지하는 게 맞음

부가 케이스:
- 같은 회원이 1차 성공 → 2FA 실패 → 다시 1차 시도 = **각 시도마다 발송** (정책에 부합)
- 비밀번호 무효 시도 = QSP `resultCode !== "S"` → 401 분기에서 발송 X (메일 폭탄 차단)
- 이메일 미등록 회원 (`!qsp.data.email`) = 발송 가드에서 자동 스킵

---

---

## 6. 자동로그인 inbound 통합 (v0.2 확정 — 발송 제외)

### 6.1 정책 (Q3 결정)
- **자동로그인(inbound)은 로그인 알림 메일 발송 대상에서 제외**
- 근거: 외부 3사(HANASYS / Q.Order / Q.Musubi) SSO 경유 진입은 본인이 의도한 동작이므로 매번 알림 발송 시 노이즈 발생
- 이상 동작 인지 목적은 **일반 로그인** 경로 (POST /api/auth/login) 가 충분히 커버

### 6.2 통합 패치 (의사코드)

```ts
// src/app/api/auth/auto-login/inbound/route.ts (라인 250 부근)
// ★ v0.2 신규 — 정책 코멘트만 추가, 코드 변경 없음

// [정책 #2125 / Q3 결정] inbound 자동로그인 시 로그인 알림 메일 발송 제외.
//   외부 3사(HANASYS/Q.Order/Q.Musubi) SSO 경유는 본인 의도된 진입이므로
//   매번 알림 발송 시 노이즈 발생. 이상 동작 인지는 /api/auth/login 경로가 커버한다.

// 9. 홈 리다이렉트 + httpOnly 쿠키 ...
```

### 6.3 fetchQspUserDetail 응답 처리
`fetchQspUserDetail` 응답에는 `loginNotiYn` 이 포함되지만, 본 라우트에서는 **사용하지 않음**. (정책상 발송 자체 안 하므로 분기 코드 추가 불필요)

---

---

## 7. 보안·운영 고려사항

| 항목 | 정책 |
|------|------|
| **PII 로깅** | 메일 본문/주소 평문 로깅 금지. `maskEmail()` 사용 |
| **Bcc 운영 보호** | dev 환경 (`APP_ENV !== "production"`) 에서 Bcc 자동 제거 |
| **fail-safe** | 메일 발송 실패는 `console.warn` + return — 본체 API 응답 무영향 |
| **변경 항목 누출 방지** | 본 schema 범위에 비밀번호 없음. 향후 확장 시 마스킹 정책 사전 정의 필요 |
| **rate** | 사용자 트리거 이벤트 (자체 행위) 이므로 별도 rate limit 불필요. 로그인은 **성공** 시점에만 발송 |
| **dev 발송 검증** | ethereal preview URL 로 본문/Bcc 적용 여부 확인 |
| **운영 발송 검증** | smtp.alpha-prm.jp 실 SMTP 통과 후 본인/운영 메일 도착 확인 |

---

## 8. Edge Cases

| 케이스 | 처리 |
|--------|------|
| `attrChgYn === null` (QSP 응답에 필드 자체 누락) | 발송 X (fail-closed: 명시적 Y 만 발송) |
| GENERAL 변경 + preDetail 조회 실패 | 알림 스킵, 본 API 는 정상 처리 (warn 로깅) |
| ADMIN/STORE 변경 + preDetail 조회 실패 | 본 API 502 (기존 동작 유지) → 알림도 자동 스킵 |
| `request` 의 모든 필드가 preDetail 과 동일 (변경 항목 0건) | 빌더 내부 가드로 발송 스킵 + log |
| `to` 가 빈 문자열 | nodemailer 가 throw → catch 에서 warn 로깅 |
| dev 환경에서 ethereal 사용 중 | 실 발송 X, preview URL 만 로깅 |
| `dbword` 매핑 누락 필드 | 본문에 포함 X + warn 로깅 (추적용) |

---

## 9. Test Plan (Zero Script QA)

본 기능은 docker logs + ethereal preview URL 로 검증.

### 9.1 속성 변경 알림 시나리오

| 시나리오 | 입력 | 기대 동작 |
|---------|------|----------|
| GENERAL + attrChgYn=Y + 회사명 변경 | compNm 변경 | 본문 `●会社情報変更` 섹션에 `会社名 : <new>` 1줄 |
| GENERAL + attrChgYn=Y + 이름·전화번호 동시 변경 | sei + telNo 변경 | 회사정보(電話番号), 회원정보(氏名(姓)) 양쪽 섹션 출력 |
| GENERAL + attrChgYn=N | 임의 변경 | 메일 발송 X, 본 API 200 |
| GENERAL + attrChgYn=null | 임의 변경 | 메일 발송 X (fail-closed) |
| GENERAL + attrChgYn=Y + 변경 항목 0건 | 모든 필드 동일 값 | 메일 발송 X + log "변경 항목 없음" |
| ADMIN + attrChgYn=Y + newsRcptYn 변경 | newsRcptYn=N | 본문 `●会員情報変更` 에 `ニュースレター受信 : N` 1줄 |
| GENERAL + preDetail 조회 실패 | QSP 502 | 본 API 정상 처리, 메일 스킵 + warn 로깅 |
| dev 환경 발송 | 임의 변경 | ethereal preview URL 로 본문 + bcc 미적용 확인 |

### 9.2 mailer.ts Bcc 옵션 회귀 테스트

| 호출자 | 기대 |
|--------|------|
| password-reset/request | 기존 동작 그대로 (bcc 없음) |
| two-factor/send | 기존 동작 그대로 |
| mass-mail/send-processor | 기존 동작 그대로 |
| notification-mail (prod) | bcc 적용 |
| notification-mail (dev) | bcc 미적용 |

### 9.3 로그인 알림 시나리오 (v0.2 신규)

| 시나리오 | 입력 | 기대 동작 |
|---------|------|----------|
| GENERAL + loginNotiYn=Y + email 등록 | 정상 로그인 (1차 성공) | 메일 1통 발송, 본문에 userNm·JST 일시·IP 포함, 본 API 200 |
| GENERAL + loginNotiYn=Y + 2FA 필요 + email 등록 | 1차 성공 (2FA 필요 표시) | 메일 1통 발송 (2FA 통과 전), 본 API `twoFactorVerified: false` 응답 |
| GENERAL + loginNotiYn=Y + 1차 성공 + 2FA 실패 + 다시 1차 시도 | 같은 회원 재시도 | **시도마다 발송** (정책에 부합) |
| GENERAL + loginNotiYn=N | 정상 로그인 | 메일 발송 X, 본 API 200 |
| GENERAL + loginNotiYn=null | 정상 로그인 | 메일 발송 X (fail-closed) |
| 비밀번호 무효 (resultCode !== "S") | 401 | 메일 발송 X (메일 폭탄 방지) |
| loginNotiYn=Y + email 미등록 | 1차 성공 (단 2FA 필요 시 403 차단) | 메일 발송 X (가드에서 스킵), 본 API 동작 무영향 |
| auto-login inbound 진입 | 외부 SSO 정상 진입 | **메일 발송 X** (Q3 정책) |
| dev 환경 발송 | 정상 로그인 | ethereal preview URL 로 본문 확인, bcc 미적용 |
| IP 추출 불가 (헤더 없음) | x-forwarded-for/x-real-ip 모두 없음 | 본문에 `IPアドレス：不明` 표기, 발송은 정상 |
| userNm null | userNm 없는 회원 | 본문에 `お客様様` 폴백 표기, 발송 정상 |

---

## 10. 구현 체크리스트

### 10.1 v0.1 (속성 변경 알림) — 완료
- [x] `src/lib/mailer.ts` — `SendMailOptions.bcc` 추가 + transporter 호출 시 전달
- [x] `src/lib/schemas/mypage.ts` — `qspUserDetailSchema` 에 `attrChgYn`, `loginNotiYn` 필드 추가 (nullable)
- [x] `src/lib/notification-mail/constants.ts` 생성
- [x] `src/lib/notification-mail/field-labels.ts` 생성
- [x] `src/lib/notification-mail/send-notification.ts` 생성
- [x] `src/lib/notification-mail/attr-change-mail.ts` 생성
- [x] `src/app/api/mypage/profile/route.ts` — preDetail 확보 → QSP 업데이트 → 알림 발송 로직 통합
- [x] Zero Script QA — 속성 변경 알림 시나리오 전수 검증

### 10.2 v0.2 (로그인 알림) — 진입 (Redmine #2125)
- [ ] `src/lib/schemas/auth.ts` — `qspLoginUserSchema` 에 `loginNotiYn: z.enum(["Y","N"]).nullable()` 1줄 추가
- [ ] `src/lib/notification-mail/constants.ts` — `LOGIN_NOTIFICATION_MAIL_SUBJECT` 값 정정 (`"ログイン通知"` → `"ログインのお知らせ"`)
- [ ] `src/lib/notification-mail/utils.ts` 신규 — `extractClientIp(request: NextRequest)` (auto-login/inbound 와 동일 정책)
- [ ] `src/lib/notification-mail/login-mail.ts` 신규 — `sendLoginNotification(ctx)` (본문 빌더 + JST 일시 포매터 포함)
- [ ] `src/app/api/auth/login/route.ts` — JWT 서명 성공 후 응답 직전, `loginNotiYn === "Y" && qsp.data.email` 가드로 `void sendLoginNotification(...)` (fire-and-forget)
- [ ] `src/app/api/auth/auto-login/inbound/route.ts` — 정책 코멘트 1줄만 추가 (Q3 결정 명시, 코드 추가 X)
- [ ] OpenAPI (`src/lib/openapi.ts`) — `/api/auth/login` description 에 알림 발송 부수효과 명시 (응답 형태 무변경)
- [ ] Zero Script QA — 로그인 알림 시나리오 전수 검증 (§9.3 신규)

### 10.3 v0.2 부가 (선택) — 풋터 공용화 (Q6)
- [ ] `src/lib/notification-mail/footer.ts` 신규 — 공통 풋터 텍스트 단일화
- [ ] `attr-change-mail.ts`, `login-mail.ts`, `signup-complete.ts`(#2041), `inquiry-confirmation.ts`(#2049) 모두 footer.ts 사용으로 정정

---

## 11. Open Items (Plan 에서 이월)

| # | Item | Owner | Status |
|---|------|-------|--------|
| Q1 | 로그인 알림 본문 사양 | 담당자 | ✅ **확정 (2026-05-04)** — Redmine #2125 본문 텍스트 + 제목 `ログインのお知らせ` |
| Q2 | 로그인 알림 발송 시점 | 담당자 | ✅ **확정 (2026-05-04)** — 1차 로그인 성공 시 즉시 (JWT 서명 후, 응답 직전) |
| Q3 | 자동로그인 inbound 발송 여부 | 담당자 | ✅ **확정 (2026-05-04)** — 발송 제외 (외부 SSO 노이즈 방지) |
| Q4 | 메일 본문 포맷 (HTML/Plain) | API 담당 | ✅ HTML `<pre>` 래핑 (mailer.ts 가 HTML 필수) |
| Q6 | 풋터 공용화 (`footer.ts`) — #2049/#2041/#2125 단일화 | API 담당 | ⏳ 본 PR 묶음 vs 별도 PR 결정 필요 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-27 | Initial draft (속성 변경 알림 implementation-ready, 로그인 알림 placeholder) | CK |
| 0.2 | 2026-05-04 | 로그인 알림 implementation-ready: §3.5 `login-mail.ts` 본문 빌더, §3.6 `utils.ts` IP 헬퍼, §5 login route 통합 의사코드, §6 inbound 제외 정책, §9.3 시나리오, §10.2/10.3 체크리스트, Q1~Q3 ✅, Q6 신설 (Redmine #2125) | CK |
