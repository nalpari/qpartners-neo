# 대량메일 발송 처리 Design Document

> **Summary**: 비동기 발송 + 수신자 테이블 + 장애 복구 이중 안전망 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-04-16
> **Status**: Draft
> **Planning Doc**: [mass-mail-send.plan.md](../../01-plan/features/mass-mail-send.plan.md)
> **선행 구현**: mass-mail CRUD (PR #52 포함)

---

## 1. Prisma Schema 변경

### 1.1 enum 명 이슈 — 의사결정 기록 (참고용)

> **⚠ 폐기 — 실제 스키마는 §1.2 참조.** 이 섹션은 의사결정 history 만 남깁니다.

Prisma enum 은 첫 문자가 숫자일 수 없어 `1ST_STORE` 같은 값을 직접 사용 불가.
3가지 옵션 중 **옵션 A** 채택:

1. **옵션 A (채택)**: enum 값을 `FIRST_STORE`, `SECOND_STORE`로 변경 (DB 컬럼값도 동일)
2. ~~옵션 B~~: DB 컬럼 타입을 VARCHAR로 하고 enum 대신 문자열 허용 — 폐기
3. ~~옵션 C~~: enum 값을 `STORE_1ST`, `STORE_2ND` 등으로 prefix — 폐기

→ 기존 `common.ts`의 `authRoleValues`는 화면 용도이므로 유지하고, DB enum 은 별도(`RecipientAuthRole`)로 관리.

### 1.2 수정된 스키마 (최종, v0.3 갱신)

```prisma
model MassMailRecipient {
  id           Int             @id @default(autoincrement())
  massMailId   Int             @map("mass_mail_id")
  email        String          @db.VarChar(255)
  userName     String?         @map("user_name") @db.VarChar(255)
  authRole     RecipientAuthRole @map("auth_role")
  status       RecipientStatus @default(pending)
  sentAt       DateTime?       @map("sent_at")
  errorMessage String?         @map("error_message") @db.VarChar(500)
  createdAt    DateTime        @default(now()) @map("created_at")
  createdBy    String?         @map("created_by") @db.VarChar(255)  // PR #60: 발송 트리거 관리자 추적
  retryCount   Int             @default(0) @map("retry_count")      // (v0.3 신규) 30초 룰 누적, 상한 3
  massMail     MassMail        @relation(fields: [massMailId], references: [id], onDelete: Cascade)

  @@index([massMailId, status], map: "idx_mass_mail_status")
  @@map("qp_mass_mail_recipients")
}

enum RecipientStatus {
  pending
  sent
  failed
}

enum RecipientAuthRole {
  SUPER_ADMIN
  ADMIN
  FIRST_STORE
  SECOND_STORE
  SEKO
  GENERAL
}
```

### 1.3 기존 MassMail 수정

```prisma
model MassMail {
  // ... 기존 필드
  status       MailStatus             @default(draft)
  sentAt       DateTime?              @map("sent_at")
  sentTotal    Int                    @default(0) @map("sent_total")    // 신규
  sentSuccess  Int                    @default(0) @map("sent_success")  // 신규
  sentFailed   Int                    @default(0) @map("sent_failed")   // 신규
  // ...
  recipients   MassMailRecipient[]    // 신규 관계
}

enum MailStatus {
  draft
  pending
  sending     // 신규
  sent
  send_failed // 신규 (자동 재시도 3회 실패)
}
```

---

## 2. 이메일 수집 모듈

### 2.1 `src/lib/mass-mail/collect-recipients.ts`

```typescript
interface CollectTargets {
  targetSuperAdmin: boolean;
  targetAdmin: boolean;
  targetFirstStore: boolean;
  targetSecondStore: boolean;
  targetConstructor: boolean;
  targetGeneral: boolean;
  optOut: boolean; // true면 수신거부 포함, false면 제외
}

interface CollectedRecipient {
  email: string;
  userName: string | null;
  authRole: RecipientAuthRole;
}

/**
 * 발송대상별 이메일 수집.
 * - QSP userListMng 호출 (userTp별 페이징 반복)
 * - storeLvl로 1차/2차 구분
 * - optOut=false면 newsRcptYn="N" 제외
 * - email 기준 중복 제거
 *
 * @param loginId QSP userListMng 호출 시 loginId 파라미터 — 발송 주체 admin userId 전달
 *                (인터페이스 로그 추적성 향상, 전역 SYSTEM_USER_ID 미사용)
 */
export async function collectRecipients(
  targets: CollectTargets,
  callerRoute: string,
  loginId: string,
): Promise<CollectedRecipient[]>;
```

### 2.2 수집 절차

```
① userTp별 조회 목록 결정
   - targetSuperAdmin || targetAdmin → ["ADMIN"]
   - targetFirstStore || targetSecondStore → ["STORE"]
   - targetGeneral → ["GENERAL"]
   - targetConstructor → ["SEKO"] (1차 제외, 로그만)

② 각 userTp별 전체 페이지 조회
   - startRow=1, endRow=PAGE_SIZE(100) → totCnt 확인 → 반복 호출
   - 안전장치: MAX_PAGES=100 (1만건 초과 시 경고)

③ 레코드별 필터 + 매핑
   - statCd 활성 회원 체크 (삭제/탈퇴 제외)
   - email null/"" 제외
   - userTp=STORE:
     - storeLvl="1" && targetFirstStore=true → FIRST_STORE
     - storeLvl="2" && targetSecondStore=true → SECOND_STORE
     - 그 외 제외
   - userTp=ADMIN:
     - (SUPER_ADMIN 구분 미확정 → 1차는 ADMIN으로 통합)
   - userTp=GENERAL → GENERAL
   - optOut=false && newsRcptYn="N" → 제외

④ email 기준 중복 제거 (Map 사용, 선착순)

⑤ 결과 반환
```

### 2.3 QSP 호출 파라미터

```typescript
const params = new URLSearchParams({
  accsSiteCd: SITE_DEFAULTS.accsSiteCd,
  loginId: SYSTEM_USER_ID, // 발송 주체 admin userId 전달
  startRow: String(startRow),
  endRow: String(endRow),
  userTp: targetUserTp, // ADMIN / STORE / GENERAL
});
```

### 2.4 QSP 응답 스키마 확장

```typescript
// src/lib/schemas/member.ts — qspMemberItemSchema 확장
const qspMemberItemSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  email: z.string().nullable(),
  userTp: z.string().nullable(),
  userTpNm: z.string().nullable(),
  compNm: z.string().nullable(),
  statCd: z.string().nullable(),
  statNm: z.string().nullable(),
  loginDt: z.string().nullable(),
  regDt: z.string().nullable(),
  // 신규 추가
  storeLvl: z.string().nullable(),        // "1" | "2" | null
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
});
```

---

## 3. 발송 처리 모듈

### 3.1 `src/lib/mass-mail/send-processor.ts`

```typescript
interface SendProcessorOptions {
  massMailId: number;
  throttleMs?: number;  // 건별 지연 (기본 200ms)
  maxRetries?: number;  // 전체 장애 자동 재시도 (기본 3)
  retryDelayMs?: number; // 재시도 간격 (기본 30_000)
}

/**
 * 비동기 발송 처리 진입점.
 * - 이메일 수집 + recipients INSERT + 순차 발송
 * - 전체 장애 시 자동 재시도 (최대 maxRetries 회)
 * - 실패 시 massMail.status = "send_failed"
 * - Fire-and-Forget: 반환 Promise는 await 불필요
 */
export async function processMassMailSend(
  options: SendProcessorOptions,
): Promise<void>;

/**
 * 재발송 진입점 (관리자 [再送信] 버튼).
 * - pending 상태 수신자만 발송 (수집/INSERT 없음)
 */
export async function processMassMailRetry(
  massMailId: number,
): Promise<void>;
```

### 3.2 processMassMailSend 상세 흐름

```
[Entry]
  1. massMail 레코드 조회 (status=pending 확인)
  2. 수신자 이미 있는지 확인 (중복 트리거 방지)
     - recipients.count > 0 이면 _sendLoop 재실행 루트로 전환
  3. try:
       a. collectRecipients(targets, callerRoute, loginId) 호출
          - 수집 결과 0건이면 status="sent" + sentTotal=0 으로 조기 종료
       b. $transaction 로 다음 2개 작업을 원자적으로 실행:
          - recipients bulk INSERT (createMany)
          - massMail.updateMany(where: { id, status: "pending" }) —
            sentTotal = recipients.length, status = "sending" (낙관적 락)
       c. _sendLoop(massMailId) 호출
  4. catch:
       a. 전체 장애 → retry 루프 (최대 MASS_MAIL_DEFAULTS.maxRetries 회,
          MASS_MAIL_DEFAULTS.retryDelayMs 간격)
       b. 재시도 진입: _sendLoop(massMailId) 재호출
          (이미 sent 처리된 건은 건너뜀)
       c. 최대 재시도 초과 → massMail.status = "send_failed" + 실패 로그

[_sendLoop(massMailId)]  ★ v0.3 변경 — 30초 룰 + retry_count
  1. recipients WHERE status="pending" AND retry_count < 3 조회
  2. for each recipient:
       a. tryOnce: await sendMail({ to, subject, html })
       b. 성공:
          - recipient.status="sent", sentAt=now
          (counter 는 루프 후 일괄 increment)
       c. 실패(개별):
          - retry_count++
          - retry_count == 3 → recipient.status="failed", errorMessage=e.message (영구실패)
          - retry_count <  3 → recipient.status="pending" 유지 + 30초 대기 후 같은 recipient 재시도
            (in-batch 30초 룰 — 같은 recipient 에 대해 한 배치 안에서 최대 3회까지)
       d. throttle (MASS_MAIL_DEFAULTS.throttleMs 대기) — 다음 recipient 로 이동
  3. 루프 종료 시점에 massMail.sent_success/sent_failed 를 한번에 increment
  4. 루프 완료:
       - 모든 recipients ∈ {sent, failed} (pending 0건) 이면
         massMail.status = "sent", sentAt = now (자동 전이 — 핵심 불변량 #3)
       - pending 잔존 (3분 배치가 다음 cycle 에서 이어받음)
         · 정상 케이스 — throw 안 함

※ bulk INSERT 와 status 전이를 원자적으로 묶어 중간 실패 시 "수신자만 남고
   상태는 pending 그대로" 같은 정합성 깨짐을 방지한다.

※ 핵심 불변량 (코드 + 스키마 모두에서 보장)
  ① recipient.retry_count ≤ 3
  ② recipient.retry_count == 3  ⇒  status ∈ {sent, failed} (pending 아님)
  ③ mass_mail.status == "sent"  ⇔  모든 recipients.status ∈ {sent, failed}
  ④ SMTP 시도 실제 횟수 == retry_count
```

### 3.3 processMassMailRetry 상세 흐름

```
1. massMail 레코드 조회 (status="send_failed" 확인, 아니면 400)
2. massMail.status = "sending"
3. _sendLoop(massMailId) 호출 (수집/INSERT 없음, 그대로 사용)
4. 완료 시 status="sent", 실패 시 다시 send_failed
```

### 3.4 발송 메일 본문

```typescript
// 발송 템플릿 (1차 — 첨부파일 미포함)
const html = `
  <div style="font-family: sans-serif; max-width: 600px;">
    ${sanitizedBody}  // DOMPurify 적용된 본문 (기존과 동일)
    <hr />
    <p style="font-size: 12px; color: #888;">
      このメールはQ.PARTNERSから送信されています。
      送信者: ${senderName}
    </p>
  </div>
`;

await sendMail({
  to: recipient.email,
  subject: mail.subject,
  html,
});
```

### 3.5 동시성 / 중복 트리거 차단 (v0.4 확장)

API Fire-and-Forget(1단계)과 3분 배치 cycle(2단계)이 같은 mass_mail 을 동시 처리할 수 있어 **3단 방어** 로 막는다.

#### L1: mass_mail 단위 분산 락 (v0.4 인-메모리 Set → v0.5 DB 락)

```typescript
/** 발송 파이프라인 중복 진입 차단 guard — qp_batch_locks 의 `mass-mail:{id}` 행. */
export async function runWithMassMailLock(
  massMailId: number,
  work: () => Promise<void>,
): Promise<void> {
  const lockName = massMailLockName(massMailId);
  const leaseMs = MASS_MAIL_DEFAULTS.batchLeaseMs;

  const holder = await acquireBatchLock(lockName, leaseMs);
  if (!holder) {
    console.warn(`[mass-mail/send-processor] massMailId ${massMailId} 이미 진행 중 — skip`);
    return;
  }

  const stopRenewal = startLeaseRenewal(lockName, holder, leaseMs);
  try {
    await work();
  } finally {
    stopRenewal();
    await releaseBatchLock(lockName, holder).catch(...);
  }
}
```

v0.4 는 `globalThis` 의 `Set<number>` 였으나, 운영 2 인스턴스에서는 프로세스 로컬 상태가
인스턴스 간 경합을 막지 못한다. 특히 관리자 [発送]/[再送信] 은 배치 cycle 락 대상이 아니고
발송 중(`status='sending'`) 메일도 배치 처리 대상이라, "A 의 수동 발송" ↔ "B 의 배치" 가
같은 pending 수신자에게 이중 발송하는 경로가 남아 있었다 → v0.5 에서 DB 락으로 교체.

모든 "수집+sendLoop+promote" 파이프라인 진입부를 이 guard 로 감싼다:
- `processMassMailSend(options)` 최상단
- `processMassMailRetry(massMailId)` 최상단
- `auto-retry-batch` cycle 내 각 mail 처리

`sendLoop` 자체는 guard 없음 — 호출자 책임(JSDoc 경고로 명시). 외부 직접 호출 시 가드 우회 가능하나 실 콜사이트는 위 3경로뿐이며 모두 guard 래핑됨.

**좀비 감지도 in-flight 제외** — `auto-retry-batch` 의 좀비 감지 단계에서 `mass-mail:{id}` 락을 보유(미만료) 중인 후보는 `send_failed` 자동 승격에서 제외. DB 기반이므로 다른 인스턴스에서 발송 중인 건도 정확히 식별된다 (소규모 발송이 좀비 threshold 초과해 오판정되는 이슈 방지).

#### L2: `collectAndQueueRecipients` $transaction 낙관적 락 (기존)

```typescript
await prisma.$transaction(async (tx) => {
  const transitionResult = await tx.massMail.updateMany({
    where: { id: massMailId, status: fromStatus },
    data: { status: "sending", sentTotal: recipients.length },
  });
  if (transitionResult.count === 0) {
    throw new StatusTransitionLostError(`massMailId=${massMailId}, expected=${fromStatus}`);
  }
  await tx.massMailRecipient.createMany({ data: ... });
}, { timeout: 30_000 });
```

두 번째 진입자는 count=0 → `StatusTransitionLostError` → tx 롤백 → `createMany` 미실행. `processMassMailSend` 의 catch 가 이 에러를 인식해 조용히 종결(`markSendFailed` 스킵).

#### L3: DB `@@unique([massMailId, email])` 제약

Prisma schema 레벨에서 이중 INSERT 최종 방어. L1/L2 우회 가정 시 마지막 가드.

#### 전제

- L1 이 DB 락이므로 다중 인스턴스에서도 성립한다 (v0.4 의 PM2 single instance 전제는 해소).
- 락 획득은 Node runtime 전용(Prisma adapter + `setInterval` 갱신). 발송 경로는 모두 Node runtime.

---

## 4. API 변경 상세

### 4.1 POST /api/admin/mass-mails

```typescript
// 기존 createMassMailRecord 완료 직후 추가:
if (data.status === "pending") {
  // Fire-and-Forget (await 하지 않음)
  processMassMailSend({ massMailId: newId }).catch((err) => {
    console.error("[POST /api/admin/mass-mails] 비동기 발송 실패:", err);
  });
}

return NextResponse.json(
  { data: { id: newId, message: "メール送信を受け付けました" } },
  { status: 201 },
);
```

### 4.2 PUT /api/admin/mass-mails/:id

```typescript
// 기존 updateMany 트랜잭션 완료 후 추가:
// (updateMany where status="draft" 조건으로 낙관적 락 이미 적용됨)
if (data.status === "pending") {
  processMassMailSend({ massMailId: id }).catch((err) => {
    console.error("[PUT /api/admin/mass-mails/:id] 비동기 발송 실패:", err);
  });
}
```

### 4.3 POST /api/admin/mass-mails/:id/retry (신규)

**파일**: `src/app/api/admin/mass-mails/[id]/retry/route.ts`

```typescript
export async function POST(request: NextRequest, { params }: Params) {
  // 1. 관리자 인증
  const auth = requireAdmin(request.headers);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  // 2. ID 파싱
  const { id: rawId } = await params;
  const idResult = massMailIdParamSchema.safeParse(rawId);
  if (!idResult.success) return NextResponse.json({ error: "IDが正しくありません" }, { status: 400 });

  // 3. 소유권 체크 + 상태 체크
  const mail = await prisma.massMail.findUnique({
    where: { id: idResult.data },
    select: { userId: true, status: true },
  });
  if (!mail) return NextResponse.json({ error: "メールが見つかりません" }, { status: 404 });
  if (mail.userId !== user.userId) return NextResponse.json({ error: "他のユーザーが作成したメールは再送信できません" }, { status: 403 });
  if (mail.status !== "send_failed") {
    return NextResponse.json({ error: "送信失敗状態のメールのみ再送信できます" }, { status: 400 });
  }

  // 4. 낙관적 락 + 상태 전이
  const updated = await prisma.massMail.updateMany({
    where: { id: idResult.data, status: "send_failed" },
    data: { status: "sending" },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "現在の状態では再送信できません" }, { status: 409 });
  }

  // 5. Fire-and-Forget
  processMassMailRetry(idResult.data).catch((err) => {
    console.error("[POST /api/admin/mass-mails/:id/retry] 비동기 재발송 실패:", err);
  });

  return NextResponse.json({
    data: { id: idResult.data, message: "メール再送信を受け付けました" },
  });
}
```

### 4.4 GET /api/admin/mass-mails/:id (상세 응답 확장 — v0.4 갱신)

**v0.4 변경 (Chicago Code Review 대응)**
- `take: FAILED_RECIPIENTS_RESPONSE_LIMIT` (500) — 무제한 배열 → 5000건 상한에서 응답 폭주 방지
- `email` → `maskEmail()` 마스킹 — 세션 탈취 시 단일 GET 으로 주소록 덤프 risk 차단
- `errorMessage` → `errorCategory` (4종 enum) — SMTP 원문(인프라 지문) 노출 금지, classifyFailure() 분류
- `failedRecipientsTotal` / `failedRecipientsTruncated` 메타 추가 — 상한 초과 시 UI 안내
- `Cache-Control: no-store` — 중간 캐시에 PII 적재 금지

```typescript
import { maskEmail } from "@/lib/interface-logger";
import { classifyFailure, FAILED_RECIPIENTS_RESPONSE_LIMIT } from "@/lib/mass-mail/constants";

const mail = await prisma.massMail.findUnique({
  where: { id: idResult.data },
  include: {
    attachments: { ... },
    recipients: {
      where: { status: "failed" },
      select: { email: true, userName: true, authRole: true, errorMessage: true, sentAt: true },
      orderBy: { id: "asc" },
      take: FAILED_RECIPIENTS_RESPONSE_LIMIT,         // (v0.4) 응답 상한
    },
  },
});

const failedTotal = mail.sentFailed;
const failedTruncated = failedTotal > mail.recipients.length;

const mapped = {
  id: mail.id,
  // ... 기존 필드
  sentTotal: mail.sentTotal,
  sentSuccess: mail.sentSuccess,
  sentFailed: mail.sentFailed,
  attachments: mail.attachments.map(...),
  failedRecipients: mail.recipients.map((r) => ({
    email: maskEmail(r.email),                        // (v0.4) PII 마스킹
    userName: r.userName,
    authRole: r.authRole,
    errorCategory: classifyFailure(r.errorMessage),   // (v0.4) 카테고리 치환 — 원문 노출 금지
    lastAttemptAt: r.sentAt?.toISOString() ?? null,
  })),
  failedRecipientsTotal: failedTotal,                 // (v0.4 신규)
  failedRecipientsTruncated: failedTruncated,         // (v0.4 신규)
  createdBy: mail.createdBy ?? "",
  createdAt: mail.createdAt.toISOString(),
};

return NextResponse.json(
  { data: mapped },
  { headers: { "Cache-Control": "no-store" } },       // (v0.4) PII 캐시 금지
);
```

**프론트 사용 흐름**
- 목록 화면에서 `sent_failed > 0` 인 row 에 [失敗確認] 버튼 노출
- 클릭 시 GET `/api/admin/mass-mails/:id` 호출 → 응답에서 `failedRecipients` 배열 추출
- 모달 팝업에 명단 표시 (마스킹 이메일/이름/role/카테고리/마지막시도시각)
- `failedRecipientsTruncated=true` 인 경우 "전체 ${failedRecipientsTotal}건 중 ${배열크기}건 표시" 안내 문구 노출
- 전수 export 가 필요해지면 감사로그 기반 별도 엔드포인트로 분리 (TODO)

### 4.5 DELETE /api/admin/mass-mails/:id (상태 체크 추가)

```typescript
if (mail.status !== "draft") {
  return NextResponse.json(
    { error: "下書き以外のメールは削除できません" },
    { status: 400 },
  );
}
```

---

## 4.6 자동 배치 모듈 (v0.3 신규 / v0.5 구동 방식 전환)

### 4.6.1 `POST /api/batch/mass-mail` (외부 스케줄러 트리거) — v0.5 전환

**v0.4 까지**: `src/instrumentation.ts` 가 서버 기동 시 `setInterval(runBatchOnce, 3분)` 을 등록.

**v0.5 부터**: 운영이 2 인스턴스로 기동되면서 각 인스턴스가 독립적으로 타이머를 돌려
같은 mass_mail 을 이중 발송하는 문제가 발생 → **프로세스 내 타이머를 제거하고
외부 스케줄러가 `POST /api/batch/mass-mail` 을 주기적으로 호출하는 방식으로 전환**.
`src/instrumentation.ts` 는 삭제되었고 `startAutoRetryBatch` / `stopAutoRetryBatch` 도 제거되었다.

| 관심사 | 소유 |
|--------|------|
| cycle 주기 | 외부 스케줄러 (앱 밖) |
| 인스턴스 간 상호배제 | `qp_batch_locks` 리스 락 (`src/lib/mass-mail/batch-lock.ts`) |
| 프로세스 내 중첩 방지 | `__massMailBatchRunning` 플래그 (기존 유지, 보완층) |
| 반복 실패 노출 | `GET /api/health` — 연속 실패 5회 도달 시 503 |

**인증**: `Authorization: Bearer <BATCH_API_TOKEN>`. 외부 스케줄러는 쿠키 세션을 가질 수 없으므로
공유 시크릿 방식이며, middleware `PUBLIC_PATHS` 에 등록하고 검증은 route handler 가 직접 수행한다.
SHA-256 다이제스트 경유 `timingSafeEqual` 비교 (길이 노출 방지 + 타이밍 공격 방어).
토큰 미설정 시 500 fail-closed — 무인증으로 열리지 않는다.

**응답**: 락을 획득해 실행을 시작하면 `202 { started: true }`, 다른 인스턴스가 보유 중이면
`200 { skipped: true, reason: "locked" }`. cycle 은 백그라운드에서 진행되므로 처리 결과는
응답에 담기지 않는다 — 스케줄러는 200/202 를 모두 정상으로 취급하면 된다.

```typescript
// src/app/api/batch/mass-mail/route.ts (요지)
const holder = await acquireBatchLock(MASS_MAIL_LOCK_NAME, leaseMs);
if (!holder) return NextResponse.json({ started: false, skipped: true, reason: "locked" });

void (async () => {
  const stopRenewal = startLeaseRenewal(MASS_MAIL_LOCK_NAME, holder, leaseMs);
  try { await runBatchOnce(); }
  finally { stopRenewal(); await releaseBatchLock(MASS_MAIL_LOCK_NAME, holder); }
})();
return NextResponse.json({ started: true, skipped: false }, { status: 202 });
```

### 4.6.1a `src/lib/mass-mail/batch-lock.ts` (v0.5 신규) — 분산 리스 락

`qp_batch_locks` 행에 대한 원자적 UPDATE 로 인스턴스 간 상호배제를 보장한다.
프로세스 로컬 플래그(`__massMailBatchRunning`)나 인-메모리 Set 은
인스턴스 경계를 넘지 못하므로 DB 를 유일한 조정 지점으로 삼는다.

락은 2종이며, 획득 순서가 항상 cycle → mail 이라 교착이 없다.

| 락 | 이름 | 획득 주체 | 막는 경합 |
|----|------|-----------|-----------|
| cycle 락 | `mass-mail` | `POST /api/batch/mass-mail` | 배치 cycle 끼리 |
| mail 락 | `mass-mail:{id}` | `runWithMassMailLock` (배치·수동 공통, §3.5 L1) | 배치 ↔ 관리자 [発送]/[再送信] |

| 동작 | 쿼리 | 비고 |
|------|------|------|
| 획득 | `UPDATE ... WHERE name=? AND expires_at <= NOW` | 단일 원자적 UPDATE — 동시 시도 시 affected=1 은 한쪽뿐. 행 부재 시 `create`, PK 충돌(P2002)은 "보유 중"으로 간주 |
| 갱신 | `UPDATE ... WHERE name=? AND holder=?` | `leaseMs/3` 주기 — 긴 cycle 이 리스보다 오래 걸려도 안전 |
| 해제 | `UPDATE expires_at=NOW WHERE name=? AND holder=?` | `holder` 조건 → 리스를 잃은 뒤엔 새 홀더의 락을 건드리지 않음 |

- 홀더 식별자는 **실행 1회당 유일** (`hostname:pid:uuid8`) — 리스를 잃은 직전 실행의 갱신 타이머가
  새 홀더의 락을 되살리지 못하게 한다.
- 홀더 프로세스가 죽으면 해제가 실행되지 않지만 리스 만료로 자동 회수된다(영구 데드락 없음).
  이 회수 지연이 `MASS_MAIL_BATCH_LEASE_MS`(기본 5분)의 의미.

### 4.6.2 `src/lib/mass-mail/auto-retry-batch.ts`

> v0.5: 아래 `startAutoRetryBatch` / `setInterval` 코드는 제거되었고 `runBatchOnce` 만 export 된다.
> cycle 본문(좀비 감지 / 예약 도래 / 수집 복구 / sendLoop / sent 승격)은 변경 없음.

```typescript
const BATCH_INTERVAL_MS = Number(process.env.MASS_MAIL_BATCH_INTERVAL_MS ?? 3 * 60 * 1000);
const ZOMBIE_THRESHOLD_MS = Number(process.env.MASS_MAIL_ZOMBIE_THRESHOLD_MS ?? 10 * 60 * 1000);
const LOG_TAG = "[mass-mail/auto-retry-batch]";

let batchTimer: NodeJS.Timeout | null = null;
let isRunning = false; // 단일 인스턴스 락 (PM2 single instance 가정)

export function startAutoRetryBatch(): void {
  if (batchTimer) return; // 중복 등록 방어
  console.log(`${LOG_TAG} 자동 재시도 배치 등록 — interval=${BATCH_INTERVAL_MS}ms`);
  batchTimer = setInterval(runBatchOnce, BATCH_INTERVAL_MS);
}

async function runBatchOnce(): Promise<void> {
  if (isRunning) {
    console.warn(`${LOG_TAG} 직전 batch 가 아직 실행 중 — 이번 cycle 건너뜀`);
    return;
  }
  isRunning = true;
  const startedAt = Date.now();

  try {
    // 1. 좀비 감지 (sending + updated_at < NOW - 10min → send_failed 로 승격)
    const zombieCutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MS);
    const zombieResult = await prisma.massMail.updateMany({
      where: { status: "sending", updatedAt: { lt: zombieCutoff } },
      data: { status: "send_failed" },
    });
    if (zombieResult.count > 0) {
      console.warn(`${LOG_TAG} 좀비 감지 — ${zombieResult.count}건 sending → send_failed 승격`);
    }

    // 2. 처리 대상 mass_mail SELECT (pending recipients 가 있거나, recipients 가 0건인 pending mail)
    const targets = await prisma.massMail.findMany({
      where: {
        status: { in: ["pending", "sending"] },
      },
      select: { id: true, status: true },
    });

    for (const mail of targets) {
      try {
        // 2-a. recipients 가 0건이면 수집부터 (collectAndQueueRecipients 재호출)
        const existingCount = await prisma.massMailRecipient.count({ where: { massMailId: mail.id } });
        if (existingCount === 0) {
          await collectAndQueueRecipients(mail.id, mail.status === "pending" ? "pending" : "sending");
        }

        // 2-b. pending recipient 가 있으면 sendLoop (30초 룰 + retry_count 적용)
        const pendingCount = await prisma.massMailRecipient.count({
          where: { massMailId: mail.id, status: "pending", retryCount: { lt: 3 } },
        });
        if (pendingCount > 0) {
          await sendLoop(mail.id, MASS_MAIL_DEFAULTS.throttleMs);
        }

        // 2-c. mass_mail.status 자동 갱신 — 모든 recipients 가 sent/failed 면 sent
        await maybePromoteToSent(mail.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_TAG} mass_mail ${mail.id} 처리 실패:`, message);
        // 다음 mail 로 계속 진행 (한 건 실패가 batch 전체 죽이지 않음)
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(`${LOG_TAG} 배치 cycle 완료 — 처리: ${targets.length}건, 소요: ${elapsed}ms`);
  } catch (error: unknown) {
    console.error(`${LOG_TAG} 배치 cycle 전체 실패:`, error);
  } finally {
    isRunning = false;
  }
}

/**
 * mass_mail.status 자동 갱신.
 * recipients 모두 sent 또는 failed 이면 mass_mail.status='sent' 로 전이.
 * (불변량 #3 보장)
 *
 * v0.4: sentAt TOCTOU 방어 — 2-step updateMany 로 원자적 처리.
 *   - 이미 sentAt 이 세팅된 행은 status 만 업데이트 (최초 기록 시점 보존)
 *   - sentAt 이 null 인 행만 새 시각 세팅
 *   - `findUnique` → `updateMany` 사이 race 로 sentAt 덮어쓰기되는 현상 제거
 */
async function maybePromoteToSent(massMailId: number): Promise<boolean> {
  const stillPending = await prisma.massMailRecipient.count({
    where: { massMailId, status: "pending" },
  });
  if (stillPending > 0) return false;

  const keepSentAt = await prisma.massMail.updateMany({
    where: { id: massMailId, status: { in: ["pending", "sending"] }, sentAt: { not: null } },
    data: { status: "sent" },
  });
  const seedSentAt = await prisma.massMail.updateMany({
    where: { id: massMailId, status: { in: ["pending", "sending"] }, sentAt: null },
    data: { status: "sent", sentAt: new Date() },
  });
  return keepSentAt.count + seedSentAt.count > 0;
}
```

### 4.6.3 sendLoop 변경 — 30초 룰 + retry_count

기존 `_sendLoop` 의 개별 SMTP 실패 처리 부분을 다음과 같이 확장:

```typescript
// before — 즉시 failed 마킹 (한 번만 시도)
catch (error: unknown) {
  await prisma.massMailRecipient.update({
    where: { id: recipient.id },
    data: { status: "failed", errorMessage: e.message },
  });
}

// after — 30초 룰 + retry_count + SMTP/DB 분리 try/catch (v0.4)
let smtpOk = false;
try {
  await sendMail({ to: recipient.email, subject, html });
  smtpOk = true;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const newRetryCount = recipient.retryCount + 1;
  if (newRetryCount >= 3) {
    try {
      // 영구 실패
      await prisma.massMailRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", retryCount: newRetryCount, errorMessage: message.slice(0, 500) },
      });
    } catch (dbErr) {
      // v0.4: DB 갱신 실패 시 현 recipient 포기, outer for 는 계속 (다음 cycle 복구)
      console.error("CRITICAL — retry_count 증분 DB 갱신 실패", dbErr);
      break;
    }
  } else {
    try {
      await prisma.massMailRecipient.update({
        where: { id: recipient.id },
        data: { retryCount: newRetryCount, errorMessage: message.slice(0, 500) },
      });
    } catch (dbErr) { break; }
    await sleep(MASS_MAIL_DEFAULTS.recipientRetryDelayMs);
  }
}

// SMTP 성공 경로 — DB 갱신은 별도 try/catch 로 분리 (v0.4 — 중복 발송 방지)
if (smtpOk) {
  try {
    await prisma.massMailRecipient.update({
      where: { id: recipient.id },
      data: { status: "sent", sentAt: new Date(), retryCount: currentRetryCount + 1 },
    });
  } catch (dbError) {
    // 1차 성공 update 실패 시 pending 유지되면 다음 cycle SMTP 재호출 → 중복 발송 위험.
    // 2차 update 로 status='failed' 강제 마킹 (orphan_send 식별, 실 메일은 나갔으나 집계상 실패).
    console.error("CRITICAL — SMTP 성공/DB 갱신 실패. orphan 마킹 시도.", dbError);
    try {
      await prisma.massMailRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "failed",
          retryCount: MASS_MAIL_DEFAULTS.recipientMaxRetry,
          errorMessage: "ORPHAN_SEND: SMTP 성공 후 DB 갱신 실패로 인한 중복 발송 차단",
          sentAt: new Date(),
        },
      });
    } catch (secondError) {
      // 2차도 실패 = DB 자체 불가 상황. 로그만 남기고 다음 recipient 로.
      console.error("CRITICAL — orphan 차단 2차 실패. 운영자 수동 개입 필요.", secondError);
    }
  }
}

// heartbeat (v0.4 신규) — 마지막 갱신 이후 60초 경과 시 mass_mail.updatedAt touch.
// 소규모 발송(<50건)이 좀비 threshold 초과해 오판정되는 것 방지.
if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
  lastHeartbeatAt = Date.now();
  await prisma.massMail.updateMany({
    where: { id: massMailId, status: "sending" },
    data: { sentTotal: { increment: 0 } }, // no-op increment 로 @updatedAt 자동 갱신
  }).catch((e) => console.warn("heartbeat 실패", e));
}
```

(상세 코드 패턴은 구현 단계에서 sendLoop 내부 for 루프 구조에 맞춰 조정)

### 4.6.4 동작 흐름 정리

```
외부 스케줄러 (cron 등) — 주기 소유
   ↓
POST /api/batch/mass-mail  (Authorization: Bearer <BATCH_API_TOKEN>)
   ↓
토큰 검증 (SHA-256 + timingSafeEqual) — 실패 401 / 미설정 500
   ↓
acquireBatchLock('mass-mail')  — 실패 시 200 skipped 로 즉시 종료
   ↓
202 응답 반환 + 백그라운드 실행 (리스 갱신 타이머 동시 시작)
   ↓
runBatchOnce()
   ├─ 좀비 감지 (sending + 10분 경과):
   │    • 후보 findMany → mail 락 보유분 제외 → send_failed 승격 (v0.5)
   ├─ pending/sending mass_mail SELECT (take:200 상한 — v0.4)
   ├─ 각 mail — runWithMassMailLock 으로 감쌈 (v0.5):
   │    ├─ recipients 0건 → collectAndQueueRecipients (L2 낙관적 락)
   │    ├─ pending recipient 있음 → sendLoop (30초 룰 + heartbeat)
   │    └─ 모두 종결 → maybePromoteToSent (2-step updateMany)
   └─ 종료 시 리스 갱신 중단 + releaseBatchLock (다음 호출이 즉시 획득 가능)
```

```typescript
// 좀비 감지에 in-flight 제외 (v0.5 — mail 락 기준으로 인스턴스 간 정확)
const zombieCandidates = await prisma.massMail.findMany({
  where: { status: "sending", updatedAt: { lt: zombieCutoff } },
  select: { id: true, updatedAt: true },
});
const heldLocks = await prisma.batchLock.findMany({
  where: {
    name: { in: zombieCandidates.map((z) => massMailLockName(z.id)) },
    expiresAt: { gt: new Date() },
  },
  select: { name: true },
});
const heldLockNames = new Set(heldLocks.map((lock) => lock.name));
const realZombieIds = zombieCandidates
  .map((z) => z.id)
  .filter((id) => !heldLockNames.has(massMailLockName(id)));
if (realZombieIds.length > 0) {
  await prisma.massMail.updateMany({
    where: { id: { in: realZombieIds }, status: "sending" },
    data: { status: "send_failed" },
  });
}
```

### 4.6.5 인스턴스 다중화 — v0.5 해결

- **v0.4 까지**: PM2 single instance 가정. `isRunning` flag 만으로 중복 실행 방지 → 운영이
  2 인스턴스가 되면서 각 인스턴스가 독립 타이머를 돌려 같은 mass_mail 이중 발송 발생.
- **v0.5**: 프로세스 내 타이머 제거 + 외부 스케줄러 트리거 + `qp_batch_locks` DB 리스 락 (§4.6.1a).
  어느 인스턴스가 요청을 받아도 한 시점에 하나만 cycle 을 실행한다.
- **v0.5 (배치 외 경로)**: in-flight 가드도 인-메모리 Set → mass_mail 단위 DB 락(`mass-mail:{id}`)
  으로 교체 (§3.5 L1). "인스턴스 A 의 배치"와 "인스턴스 B 가 받은 관리자 즉시발송/재발송"이
  같은 mass_mail 에 동시 진입하던 경합까지 차단된다.
- **남은 범위**: recipient 단위 선점(claim)은 없다. 상호배제는 mass_mail 단위 락이 담당하며,
  락을 잃은 상태(리스 만료 후 인계)에서는 같은 pending 수신자를 두 실행이 집을 수 있다.
  리스 갱신이 정상 동작하는 한 발생하지 않으며, 발생 시 `startLeaseRenewal` 이 CRITICAL 로그를 남긴다.

---

## 5. 설정 / 상수

### 5.1 환경변수

```
# 기존 (변경 없음)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@qpartners.jp
SMTP_USE_ETHEREAL=false

# 신규 (v0.2 까지)
MASS_MAIL_THROTTLE_MS=200          # 건별 발송 간격
MASS_MAIL_MAX_RETRIES=3             # 전체 장애 자동 재시도 횟수 (in-process)
MASS_MAIL_RETRY_DELAY_MS=30000      # in-process 재시도 간격
MASS_MAIL_PAGE_SIZE=100             # QSP 목록 페이지당 건수
MASS_MAIL_MAX_PAGES=100             # 페이징 안전장치 (1만건 상한)

# v0.3 신규 (배치)
MASS_MAIL_ZOMBIE_THRESHOLD_MS=600000      # 좀비 감지 임계 — 10분
MASS_MAIL_RECIPIENT_MAX_RETRY=3           # recipient 단위 30초 룰 상한
MASS_MAIL_RECIPIENT_RETRY_DELAY_MS=30000  # 30초 룰 간격

# v0.5 신규 (외부 스케줄러 트리거 전환)
BATCH_API_TOKEN=...                       # 배치 엔드포인트 공유 시크릿 (최소 32자, 전 환경 필수)
MASS_MAIL_BATCH_LEASE_MS=300000           # 분산 락 리스 기간 — 5분 (leaseMs/3 주기 자동 갱신)

# v0.5 제거
# MASS_MAIL_BATCH_INTERVAL_MS — cycle 주기는 외부 스케줄러가 소유하므로 앱 설정에서 제거
```

### 5.2 src/lib/config.ts 추가

```typescript
export const MASS_MAIL_DEFAULTS = {
  throttleMs: Number(process.env.MASS_MAIL_THROTTLE_MS ?? 200),
  maxRetries: Number(process.env.MASS_MAIL_MAX_RETRIES ?? 3),
  retryDelayMs: Number(process.env.MASS_MAIL_RETRY_DELAY_MS ?? 30_000),
  pageSize: Number(process.env.MASS_MAIL_PAGE_SIZE ?? 100),
  maxPages: Number(process.env.MASS_MAIL_MAX_PAGES ?? 100),
  // v0.3 — 자동 배치 관련 (v0.5: batchIntervalMs → batchLeaseMs 로 대체)
  batchLeaseMs: Number(process.env.MASS_MAIL_BATCH_LEASE_MS ?? 5 * 60 * 1000),
  zombieThresholdMs: Number(process.env.MASS_MAIL_ZOMBIE_THRESHOLD_MS ?? 10 * 60 * 1000),
  recipientMaxRetry: Number(process.env.MASS_MAIL_RECIPIENT_MAX_RETRY ?? 3),
  recipientRetryDelayMs: Number(process.env.MASS_MAIL_RECIPIENT_RETRY_DELAY_MS ?? 30_000),
} as const;
```

---

## 6. File Structure (최종, v0.5)

```
src/
├── app/api/batch/mass-mail/
│   └── route.ts                        # (v0.5 신규) 외부 스케줄러 트리거 — 토큰 검증 + 분산 락 + 202
├── app/api/health/
│   └── route.ts                        # (v0.5 갱신) 타이머 존재 검사 → cycle 연속 실패 검사로 전환
├── app/api/admin/mass-mails/
│   ├── route.ts                        # 기존 — POST 트리거
│   └── [id]/
│       ├── route.ts                    # 기존 — PUT 트리거, GET 응답 확장(failedRecipients), DELETE 상태 체크
│       └── retry/
│           └── route.ts                # 기존
├── lib/
│   ├── mailer.ts                       # 기존
│   ├── config.ts                       # 기존 — MASS_MAIL_DEFAULTS(batchLeaseMs) + getBatchApiToken()
│   ├── mass-mail/
│   │   ├── collect-recipients.ts       # 기존
│   │   ├── send-processor.ts           # 기존 — sendLoop 에 30초 룰 + retry_count 추가
│   │   ├── batch-lock.ts               # (v0.5 신규) qp_batch_locks 분산 리스 락
│   │   ├── batch-state.ts              # (v0.5 신규) 배치 런타임 상태 — auto-retry-batch ↔ health 공유
│   │   └── auto-retry-batch.ts         # (v0.3 신규 / v0.5 setInterval 제거) 배치 cycle 본체
│   ├── middleware.ts                   # (v0.5 갱신) PUBLIC_PATHS 에 /api/batch/mass-mail 추가
│   ├── openapi.ts                      # 기존 — 스펙 동기화 (Batch 태그 + /batch/mass-mail 추가)
│   └── schemas/
│       ├── mass-mail.ts                # 기존
│       └── member.ts                   # 기존
└── generated/prisma/                   # 자동 생성
prisma/
└── schema.prisma                       # MassMailRecipient.retry_count (v0.3) + BatchLock 모델 (v0.5)

(v0.5 삭제) src/instrumentation.ts     # setInterval 등록 훅 — 외부 스케줄러 전환으로 불필요
```

---

## 7. Implementation Order

**Phase 1 — 기반 (이미 구현 완료, v0.2 까지)**

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|-----------|
| 1 | Prisma 스키마 변경 (테이블+enum+컬럼) | prisma/schema.prisma | 소 |
| 2 | prisma db push + generate | - | 소 |
| 3 | QSP 응답 스키마 확장 | src/lib/schemas/member.ts | 소 |
| 4 | MASS_MAIL_DEFAULTS 추가 | src/lib/config.ts | 소 |
| 5 | collect-recipients.ts | src/lib/mass-mail/collect-recipients.ts | 중 (150줄) |
| 6 | send-processor.ts | src/lib/mass-mail/send-processor.ts | 중 (200줄) |
| 7 | POST/PUT 트리거 연결 | mass-mails/route.ts, [id]/route.ts | 소 |
| 8 | GET 응답 확장 (sentTotal/Success/Failed) | mass-mails/[id]/route.ts | 소 |
| 9 | DELETE 상태 체크 | mass-mails/[id]/route.ts | 소 |
| 10 | retry API | mass-mails/[id]/retry/route.ts | 소 (80줄) |
| 11 | openapi.ts 동기화 | src/lib/openapi.ts | 소 |

**Phase 2 — v0.3 추가 (자동 배치 + 失敗確認 UI)**

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|-----------|
| 12 | retry_count 컬럼 추가 + db push + generate | prisma/schema.prisma | 소 (1줄) |
| 13 | MASS_MAIL_DEFAULTS 에 batch 관련 4개 추가 | src/lib/config.ts | 소 |
| 14 | sendLoop 에 30초 룰 + retry_count 증분 | src/lib/mass-mail/send-processor.ts | 소 (20~30줄) |
| 15 | maybePromoteToSent 헬퍼 (mass_mail.status 자동 갱신) | src/lib/mass-mail/send-processor.ts | 소 (20줄) |
| 16 | auto-retry-batch.ts (배치 본체) | src/lib/mass-mail/auto-retry-batch.ts | 중 (100~120줄) |
| 17 | instrumentation.ts (Next.js 기동 훅) | src/instrumentation.ts | 소 (15~30줄) |
| 18 | GET 응답에 failedRecipients 포함 | mass-mails/[id]/route.ts | 소 (15~20줄) |
| 19 | openapi.ts — failedRecipients 필드 추가 | src/lib/openapi.ts | 소 (10줄) |
| 20 | (프론트) 목록 [失敗確認] 버튼 + 모달 팝업 | components/admin/bulk-mail/* | 별도 PR |

**총 v0.3 추가 규모**: 신규 파일 2개(약 130줄) + 기존 파일 수정 5개 (약 70줄)

---

## 8. 테스트 시나리오

### 8.1 정상 발송

```
1. POST /api/admin/mass-mails (status=pending, targetGeneral=true)
2. 즉시 201 응답 확인
3. 상세 GET 호출 → status="sending" 확인 (수 초 내)
4. 대기 → 재호출 → status="sent", sentSuccess>0 확인
5. DB: recipients 테이블에 sent 레코드 확인
```

### 8.2 중복 트리거 방지

```
1. POST /api/admin/mass-mails (status=pending)
2. 즉시 PUT /api/admin/mass-mails/:id (status=pending) 호출
3. PUT은 낙관적 락으로 409 or 400 반환
4. 발송은 1회만 실행 확인
```

### 8.3 개별 실패 처리

```
1. 수신자 중 1명의 email을 잘못된 형식으로 주입 (테스트용 DB 조작)
2. 발송 실행
3. 해당 수신자만 status="failed" + errorMessage 기록
4. 나머지는 정상 발송, massMail.status="sent"
```

### 8.4 자동 재시도 → 수동 재발송

```
1. SMTP 일시 중단 (또는 mailer mock)
2. POST 발송 → 자동 재시도 3회 모두 실패
3. massMail.status = "send_failed" 확인
4. POST /:id/retry 호출
5. SMTP 복구 후 재발송 → sent 수신자는 건너뛰고 pending만 발송
```

### 8.5 발송 취소 불가

```
1. POST 발송
2. sending 상태에서 DELETE 호출 → 400 반환
3. sent 상태에서 DELETE 호출 → 400 반환
4. draft 상태만 DELETE 성공
```

### 8.6 (v0.3 신규) 30초 룰 + 배치 자동 복구 통합 시나리오

```
1. POST 발송 — 100명 대상
2. 비동기 1회 시도 (Fire-and-Forget)
   - 95명 성공 → status="sent"
   - 5명 SMTP 일시 거부 → retry_count=1, status="pending"
3. 1분 후 mass_mail.status="sending" (recipients 5건 pending)
4. 3분 배치 cycle 진입
   - SELECT pending recipient 5건
   - 각 recipient 30초 룰 적용 (시도 → 실패 시 30초 대기 → 재시도)
   - 시도 결과 분기:
     · 메일함 복구된 4명 → status="sent"
     · 진짜 무효 1명 → 30초 룰로 retry_count 3 도달 → status="failed", errorMessage 기록
5. 모든 recipients 종결 (pending 0건)
   → maybePromoteToSent 가 mass_mail.status="sent" 로 자동 전이
6. 검증
   - mass_mail.sent_success = 99
   - mass_mail.sent_failed  = 1
   - DB: failed recipient 1건 (status='failed', error_message='550 mailbox not found')
```

### 8.7 (v0.3 신규) 좀비 자동 복구

```
1. mass_mail.status="sending" 상태에서 PM2 process kill
2. 서버 재시작 (instrumentation.ts 자동 실행)
3. 배치 cycle 진입 (3분 후 또는 즉시 다음 cycle)
4. 좀비 감지: status='sending' AND updated_at < NOW - 10min
   → status='send_failed' 로 승격
5. 다음 cycle 에서 send_failed → 어떻게? (현 설계에선 send_failed 는 수동 retry 대상)
   ※ 이 부분은 v0.3 에서는 좀비 감지까지만 자동화. 운영자가 [再送信] 클릭 필요.
   ※ 향후 enhancement: send_failed 도 retry_count 기반 자동 재시도 가능.
```

### 8.8 (v0.3 신규) 失敗確認 UI 흐름

```
1. 대량메일 목록 화면 진입
2. row #13 의 sent_failed=5 → [失敗確認] 버튼 노출
3. 버튼 클릭 → GET /api/admin/mass-mails/13 호출
4. 응답 mapped.failedRecipients[5건] 추출
5. 모달 팝업 렌더링 — 표 형태로 5건 표시
6. 각 row: 이메일 / 이름 / role / 실패사유(errorMessage) / 마지막시도시각
```

---

## 9. 미결 사항 & 대응

| # | 항목 | 1차 대응 | 2차 계획 |
|---|------|----------|---------|
| 1 | SUPER_ADMIN/ADMIN 구분 | 둘 다 ADMIN으로 통합 발송 | QSP 측 authCd 추가 후 분리 |
| 2 | 첨부파일 발송 | 미포함 (본문만) | PO 확정 후 직접 첨부 or 링크 |
| 3 | 시공점 발송 | 스킵 + 경고 로그 | Seko API 확보 후 추가 |
| ~~4~~ | ~~서버 기동 시 sending 잔존~~ | ~~수동 대응 (관리자 retry)~~ | **✅ v0.3 자동 배치로 해결 (좀비 감지 + 자동 승격)** |
| 5 | (v0.3 신규) 인스턴스 다중화 | PM2 single instance + isRunning flag | cluster/K8s 시 분산 락 (pg_advisory_lock 등) 도입 |
| 6 | (v0.3 신규) send_failed 자동 재시도 | 현재는 수동 [再送信] 만 | 운영 데이터 보고 retry_count 기반 자동화 검토 |
| 7 | (v0.3 신규) 失敗者 CSV 출력 | 모달 표시만 | 운영 피드백 후 CSV 다운로드 추가 |
| 8 | (v0.3 신규) 失敗理由 일본어 매핑 | 원문 errorMessage 그대로 노출 | 운영자 친화 매핑 테이블 도입 검토 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-16 | Initial draft (Plan 0.3 기반) | CK |
| 0.2 | 2026-04-17 | Gap 분석 반영 — §2.1 collectRecipients 시그니처에 loginId 파라미터 추가, §3.2 bulk INSERT + status 전이를 $transaction 원자화로 명시 | CK |
| 0.3 | 2026-04-19 | **Plan v0.4 반영 — 3분 배치 자동 복구 + retry_count 컬럼 + 失敗確認 UI**. §1.2 retry_count 컬럼 추가. §3.2 sendLoop 에 30초 룰 + retry_count 증분 명세. §4.4 GET 응답에 failedRecipients 배열 추가 (신규 API 라우트 없음). §4.6 자동 배치 모듈 신규 섹션 추가 (instrumentation.ts + auto-retry-batch.ts). §5 환경변수 4개 추가 (BATCH_INTERVAL_MS, ZOMBIE_THRESHOLD_MS 등). §6 file structure 갱신. §7 Phase 1/2 구분. §8.6~8.8 테스트 시나리오 3개 추가. §9 미결사항 #4 해결 표시 + #5~#8 신규. | CK |
| 0.4 | 2026-04-19 | **PR #62 리뷰 대응 + 동시성 보호 강화 (Plan v0.5 연동)**. §3.5 동시성 3단 방어 구조 확장 (inFlightMassMails + runWithInFlightGuard + globalThis HMR 안전). §4.6.2 maybePromoteToSent 2-step updateMany (sentAt TOCTOU 제거). §4.6.3 sendLoop SMTP/DB 분리 try/catch + orphan_send 마킹 + heartbeat 시간 기반 60초. §4.6.4 좀비 감지에 in-flight 가드 + take:200 상한. next.config.ts Edge runtime webpack IgnorePlugin 추가 (instrumentation.ts → auto-retry-batch → prisma/mariadb 체인 Edge 번들 resolve 실패 해결). | CK |
| 0.5 | 2026-08-04 | **배치 구동 방식 전환 — setInterval → 외부 스케줄러 엔드포인트**. 운영 2 인스턴스가 각자 타이머를 돌려 같은 mass_mail 을 이중 발송하던 문제 해소. §4.6.1 `POST /api/batch/mass-mail` 신규 (Bearer BATCH_API_TOKEN 인증, 202/200-skipped). §4.6.1a `batch-lock.ts` 분산 리스 락 신규 (`qp_batch_locks` 원자적 UPDATE + leaseMs/3 자동 갱신). §4.6.2 `startAutoRetryBatch`/`stopAutoRetryBatch`/setInterval 제거, `src/instrumentation.ts` 삭제. §4.6.4 동작 흐름 갱신. §4.6.5 인스턴스 다중화 해결 표시. `/api/health` 검사 항목을 타이머 존재 → cycle 연속 실패로 전환. §5 `MASS_MAIL_BATCH_INTERVAL_MS` 제거, `BATCH_API_TOKEN`/`MASS_MAIL_BATCH_LEASE_MS` 추가. §6 file structure 갱신. | CK |
