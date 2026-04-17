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

### 1.1 신규 테이블: MassMailRecipient

```prisma
/// 대량메일 수신자 (발송 대상 개별 추적)
model MassMailRecipient {
  id           Int                         @id @default(autoincrement())
  massMailId   Int                         @map("mass_mail_id")
  email        String                      @db.VarChar(255)
  userName     String?                     @map("user_name") @db.VarChar(255)
  authRole     qp_mass_mail_recipients_auth_role @map("auth_role")
  status       RecipientStatus             @default(pending)
  sentAt       DateTime?                   @map("sent_at")
  errorMessage String?                     @map("error_message") @db.VarChar(500)
  createdAt    DateTime                    @default(now()) @map("created_at")
  massMail     MassMail                    @relation(fields: [massMailId], references: [id], onDelete: Cascade)

  @@index([massMailId, status], map: "idx_mass_mail_status")
  @@map("qp_mass_mail_recipients")
}

enum RecipientStatus {
  pending
  sent
  failed
}

enum qp_mass_mail_recipients_auth_role {
  SUPER_ADMIN
  ADMIN
  @@map("1ST_STORE") // Prisma는 숫자 시작 enum 불가 → @@map 사용
  // 실제 컬럼값: 1ST_STORE, 2ND_STORE
  // 대안: enum 명 재검토 필요 — 아래 주석 참고
}
```

**⚠ enum 명 이슈**:
Prisma enum은 첫 문자가 숫자일 수 없다. 3가지 옵션 중 택1:

1. **옵션 A (권장)**: enum 값을 `FIRST_STORE`, `SECOND_STORE`로 변경 (DB 컬럼값도 동일)
2. **옵션 B**: DB 컬럼 타입을 VARCHAR로 하고 enum 대신 문자열 허용
3. **옵션 C**: enum 값을 `STORE_1ST`, `STORE_2ND` 등으로 prefix

→ **옵션 A 채택**: `FIRST_STORE`, `SECOND_STORE`. 기존 `common.ts`의 `authRoleValues`는 화면 용도이므로 유지하고, DB enum은 별도로 관리.

### 1.2 수정된 스키마 (최종)

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

[_sendLoop(massMailId)]
  1. recipients WHERE status="pending" 조회
  2. for each recipient:
       a. await sendMail({ to, subject, html })
       b. 성공: recipient.status="sent", sentAt=now (counter는 루프 후 일괄 increment)
       c. 실패(개별): recipient.status="failed", errorMessage=e.message
       d. throttle (MASS_MAIL_DEFAULTS.throttleMs 대기)
  3. 루프 종료 시점에 massMail.sent_success/sent_failed 를 한번에 increment
  4. 루프 완료:
       - pending 수신자 0이면 massMail.status = "sent", sentAt = now
       - pending 수신자 남아있으면 throw (전체 장애로 간주 → retry 루프)

※ bulk INSERT 와 status 전이를 원자적으로 묶어 중간 실패 시 "수신자만 남고
   상태는 pending 그대로" 같은 정합성 깨짐을 방지한다.
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

### 3.5 동시성 / 중복 트리거 차단

```typescript
// massMail.status 업데이트는 낙관적 락 사용
const updated = await prisma.massMail.updateMany({
  where: { id: massMailId, status: "pending" },
  data: { status: "sending" },
});
if (updated.count === 0) {
  // 이미 다른 요청이 sending 으로 전환 → 중복 호출 방지
  console.warn("[send-processor] 이미 발송 중인 메일:", massMailId);
  return;
}
```

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

### 4.4 GET /api/admin/mass-mails/:id (상세 응답 확장)

```typescript
const mapped = {
  id: mail.id,
  senderName: mail.senderName,
  targets: buildTargetsObject(mail),
  targetsLabel: buildTargetLabel(mail),
  optOut: mail.optOut,
  subject: mail.subject,
  body: mail.body,
  status: mail.status,
  sentAt: mail.sentAt?.toISOString() ?? null,
  sentTotal: mail.sentTotal,     // 신규
  sentSuccess: mail.sentSuccess, // 신규
  sentFailed: mail.sentFailed,   // 신규
  attachments: mail.attachments.map(...),
  createdBy: mail.createdBy ?? "",
  createdAt: mail.createdAt.toISOString(),
};
```

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

# 신규
MASS_MAIL_THROTTLE_MS=200          # 건별 발송 간격
MASS_MAIL_MAX_RETRIES=3             # 전체 장애 자동 재시도 횟수
MASS_MAIL_RETRY_DELAY_MS=30000      # 재시도 간격
MASS_MAIL_PAGE_SIZE=100             # QSP 목록 페이지당 건수
MASS_MAIL_MAX_PAGES=100             # 페이징 안전장치 (1만건 상한)
```

### 5.2 src/lib/config.ts 추가

```typescript
export const MASS_MAIL_DEFAULTS = {
  throttleMs: Number(process.env.MASS_MAIL_THROTTLE_MS ?? 200),
  maxRetries: Number(process.env.MASS_MAIL_MAX_RETRIES ?? 3),
  retryDelayMs: Number(process.env.MASS_MAIL_RETRY_DELAY_MS ?? 30_000),
  pageSize: Number(process.env.MASS_MAIL_PAGE_SIZE ?? 100),
  maxPages: Number(process.env.MASS_MAIL_MAX_PAGES ?? 100),
} as const;
```

---

## 6. File Structure (최종)

```
src/
├── app/api/admin/mass-mails/
│   ├── route.ts                        # 기존 — POST 트리거 추가
│   └── [id]/
│       ├── route.ts                    # 기존 — PUT 트리거, GET 응답 확장, DELETE 상태 체크
│       └── retry/
│           └── route.ts                # 신규
├── lib/
│   ├── mailer.ts                       # 기존
│   ├── config.ts                       # 기존 — MASS_MAIL_DEFAULTS 추가
│   ├── mass-mail/
│   │   ├── collect-recipients.ts       # 신규
│   │   └── send-processor.ts           # 신규
│   ├── openapi.ts                      # 기존 — 스펙 동기화
│   └── schemas/
│       ├── mass-mail.ts                # 기존
│       └── member.ts                   # 기존 — qspMemberItemSchema 확장
└── generated/prisma/                   # 자동 생성
prisma/
└── schema.prisma                       # 기존 — MassMailRecipient + enum + 컬럼 추가
```

---

## 7. Implementation Order

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|-----------|
| 1 | Prisma 스키마 변경 | prisma/schema.prisma | 소 |
| 2 | prisma db push + generate | - | 소 |
| 3 | QSP 응답 스키마 확장 | src/lib/schemas/member.ts | 소 |
| 4 | MASS_MAIL_DEFAULTS 추가 | src/lib/config.ts | 소 |
| 5 | collect-recipients.ts | src/lib/mass-mail/collect-recipients.ts | 중 (150줄) |
| 6 | send-processor.ts | src/lib/mass-mail/send-processor.ts | 중 (200줄) |
| 7 | POST/PUT 트리거 연결 | mass-mails/route.ts, [id]/route.ts | 소 |
| 8 | GET 응답 확장 | mass-mails/[id]/route.ts | 소 |
| 9 | DELETE 상태 체크 | mass-mails/[id]/route.ts | 소 |
| 10 | retry API | mass-mails/[id]/retry/route.ts | 소 (80줄) |
| 11 | openapi.ts 동기화 | src/lib/openapi.ts | 소 |

**총 예상 규모**: 신규 파일 3개(약 450줄) + 기존 파일 수정 5개 (약 100줄)

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

---

## 9. 미결 사항 & 대응

| # | 항목 | 1차 대응 | 2차 계획 |
|---|------|----------|---------|
| 1 | SUPER_ADMIN/ADMIN 구분 | 둘 다 ADMIN으로 통합 발송 | QSP 측 authCd 추가 후 분리 |
| 2 | 첨부파일 발송 | 미포함 (본문만) | PO 확정 후 직접 첨부 or 링크 |
| 3 | 시공점 발송 | 스킵 + 경고 로그 | Seko API 확보 후 추가 |
| 4 | 서버 기동 시 sending 잔존 | 수동 대응 (관리자 retry) | 자동 복구 검토 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-16 | Initial draft (Plan 0.3 기반) | CK |
| 0.2 | 2026-04-17 | Gap 분석 반영 — §2.1 collectRecipients 시그니처에 loginId 파라미터 추가, §3.2 bulk INSERT + status 전이를 $transaction 원자화로 명시 | CK |
