# 로그인 알림 + 속성정보 변경 알림 Design Document

> **Summary**: 회원관리 알림 설정(`loginNotiYn` / `attrChgYn`) 유효 회원에게 로그인·속성변경 시점에 알림 메일 자동 발송. 본 문서는 **속성 변경 알림** 을 implementation-ready 수준으로, **로그인 알림** 을 placeholder(담당자 회신 대기) 로 설계.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-27
> **Status**: Draft v0.1
> **Planning Doc**: [login-attr-notification.plan.md](../../01-plan/features/login-attr-notification.plan.md)
> **화면설계서**: p.47 #6 (로그인 알림), p.47 #7 (속성변경 알림)

---

## 1. Architecture

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Trigger Endpoints                        │
├─────────────────────────────────────────────────────────────┤
│ PUT  /api/mypage/profile   ── (속성 변경 알림 트리거)         │
│ POST /api/auth/login       ── (로그인 알림 트리거, TBD)       │
│ POST /api/auth/two-factor/verify ── (FR-L6 결정에 따라)       │
│ POST /api/auth/auto-login/inbound ── (FR-L7 결정에 따라)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         src/lib/notification-mail/  (신규 모듈)               │
├─────────────────────────────────────────────────────────────┤
│ ├ constants.ts          (제목·From·Bcc 상수)                  │
│ ├ field-labels.ts       (TO-BE 필드 → 일본어 라벨 매핑)        │
│ ├ attr-change-mail.ts   (속성 변경 메일 빌더 + 발송 헬퍼)      │
│ ├ login-mail.ts         (로그인 알림 메일 빌더, TBD)          │
│ └ send-notification.ts  (Bcc 가드 + fail-safe 발송 래퍼)      │
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

/** 로그인 알림 제목 — TBD (담당자 회신 후 확정) */
export const LOGIN_NOTIFICATION_MAIL_SUBJECT = "【Q.PARTNERS】ログイン通知"; // placeholder
```

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

### 3.5 `login-mail.ts` (TBD)

```ts
// src/lib/notification-mail/login-mail.ts
// ⏳ 담당자 회신 대기 (Q1, Q2, Q3)
//
// 회신 후 결정 항목:
//   - 메일 제목 / 본문
//   - 발송 시점 (1차 로그인 vs 2FA 완료)
//   - 자동로그인(inbound) 발송 여부
//
// 회신 후 attr-change-mail.ts 와 동일한 패턴으로 구현.
```

본 design v0.1 에서는 placeholder 만 정의. 회신 후 v0.2 에서 보강.

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

## 5. POST /api/auth/login 통합 (TBD)

```ts
// src/app/api/auth/login/route.ts
// ⏳ 담당자 회신 대기 (Q1, Q2)
//
// 회신 후 결정 항목:
//   - 발송 시점:
//     (A) 로그인 성공 직후 (2FA 필요 케이스도 발송)
//     (B) 2FA 완료 후 발송 (POST /api/auth/two-factor/verify 에서 처리)
//   - 본문 사양 확정 후 sendLoginNotification(...) 호출 추가
//
// 발송 위치 (A 채택 시):
//   - response.cookies.set 직전, qsp.data.loginNotiYn === "Y" 분기
//   - fire-and-forget 으로 호출
```

본 design v0.1 에서는 통합 위치만 명시. 회신 후 구체화.

---

## 6. 자동로그인 inbound 통합 (TBD)

`POST /api/auth/auto-login/inbound` 발송 여부:
- **(A) 발송**: 외부 시스템에서 진입한 사용자도 본인 계정 로그인 사실 인지 가능 → 보안 모니터링 강화
- **(B) 발송 X**: 외부 시스템 자동 진입은 사용자가 의도한 동작 → 알림 노이즈 발생 가능

→ 담당자 결정 대기 (Q3).

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

---

## 10. 구현 체크리스트

- [ ] `src/lib/mailer.ts` — `SendMailOptions.bcc` 추가 + transporter 호출 시 전달
- [ ] `src/lib/schemas/mypage.ts` — `qspUserDetailSchema` 에 `attrChgYn`, `loginNotiYn` 필드 추가 (nullable)
- [ ] `src/lib/notification-mail/constants.ts` 생성
- [ ] `src/lib/notification-mail/field-labels.ts` 생성
- [ ] `src/lib/notification-mail/send-notification.ts` 생성
- [ ] `src/lib/notification-mail/attr-change-mail.ts` 생성
- [ ] `src/app/api/mypage/profile/route.ts` — preDetail 확보 → QSP 업데이트 → 알림 발송 로직 통합
- [ ] OpenAPI (`src/lib/openapi.ts`) — 본 API 동작 변경 사항 description 보강 (응답 형태 변경 없음, 부수효과만 추가)
- [ ] Zero Script QA — 위 시나리오 전수 검증
- [ ] (TBD) login-mail.ts + login route 통합 (Q1~Q3 회신 후)

---

## 11. Open Items (Plan 에서 이월)

| # | Item | Owner | Status |
|---|------|-------|--------|
| Q1 | 로그인 알림 본문 사양 | 담당자 | ⏳ 회신 대기 |
| Q2 | 로그인 알림 발송 시점 | 담당자 | ⏳ 회신 대기 |
| Q3 | 자동로그인 inbound 발송 여부 | 담당자 | ⏳ 회신 대기 |
| Q4 | 메일 본문 포맷 (HTML/Plain) | API 담당 | ✅ 결정: HTML `<pre>` 래핑 (mailer.ts 가 HTML 필수) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-27 | Initial draft (속성 변경 알림 implementation-ready, 로그인 알림 placeholder) | CK |
