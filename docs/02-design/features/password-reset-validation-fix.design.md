# Password Reset 검증 결함 수정 Design Document (Redmine #2156)

> **Summary**: `password-reset/request` 라우트의 QSP `userDetail` 호출을 userTp 별로 분기하고 사후 매칭을 추가하여 두 결함(False Negative GENERAL / False Positive STORE)을 동시 해결. 화면 SEKO 입력란 단일화 + GENERAL 라벨 정확화.
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-05-06
> **Status**: Draft
> **Planning Doc**: [password-reset-validation-fix.plan.md](../../01-plan/features/password-reset-validation-fix.plan.md)
> **Predecessor Design**: [password-reset.design.md](./password-reset.design.md) — 본 PR 은 그 §2 의 입력 항목·특정 방식 부분을 수정/대체
> **Reference Design**: `src/app/api/auth/email/check/route.ts` — dual-key 패턴 / AbortController race / LookupOutcome 타입 분리 (재사용 모델)

---

## 0. Change Summary (vs 기존 password-reset.design.md)

| 항목 | 기존 | 변경 후 |
|---|---|---|
| QSP 호출 키 (STORE) | loginId + email + userTp | **loginId + userTp** (email 미전송) |
| QSP 호출 키 (SEKO) | sekoId + email + userTp | **email + userTp** (sekoId 제거) |
| QSP 호출 키 (GENERAL) | email + userTp | **loginId 단독 + email 단독 두 번 병렬** |
| 사후 매칭 (STORE) | 없음 | **응답 `data.email` == 입력 `email` AND** |
| 화면 (SEKO 탭) | 施工店ID(선택) + E-Mail*(필수) | **E-Mail*(필수) 1개만** |
| 화면 (GENERAL 탭) | "ID(E-Mail)" type=email | **"ID または E-Mail" type=text** |
| Request body sekoId | optional | **필드 제거** |
| Request body loginId | STORE 만 필수 | **STORE 필수 / GENERAL 입력값 운반용으로도 사용** |

---

## 1. Architecture

### 1.1 분기 구조

```
[Client — password-reset-popup]
    │
    ├── dealer 탭   → { userTp: "STORE",   loginId, email }
    ├── installer 탭 → { userTp: "SEKO",    email }
    └── general 탭  → { userTp: "GENERAL", loginId: <X> }   // 입력값 X 를 loginId 필드로 전송
    │
    ▼
[POST /api/auth/password-reset/request]
    │  1. Zod 검증 (userTp 별 superRefine)
    │  2. Rate limit (IP + email) — 현행 유지
    │  3. ┌── STORE   ── lookupStore(loginId)        ── 응답 email 평문이 입력 email 과 일치
    │     ├── SEKO    ── lookupSeko(email)           ── hit 시 통과
    │     └── GENERAL ── lookupGeneral(X) (병렬 race) ── loginId 단독 OR email 단독 매칭
    │  4. mismatch / TooManyResults / not-found → 404 (일관 메시지)
    │  5. 매칭 회원의 email 기준으로 토큰 생성 + 메일 발송
    │
    ▼
(이후 verify / confirm 흐름은 기존 design 유지 — 본 PR 범위 외)
```

### 1.2 매칭 정책 매트릭스 (재게시)

| userTp | 화면 입력 | QSP 호출 | 통과 조건 |
|---|---|---|---|
| STORE | loginId + email | `?accsSiteCd&loginId&userTp=STORE` | `resultCode=S` AND `data.email == 입력 email` |
| SEKO | email | `?accsSiteCd&email&userTp=SEKO` | `resultCode=S` AND `data != null` |
| GENERAL | 단일값 X (loginId 필드) | `?loginId=X&userTp=GENERAL` AND `?email=X&userTp=GENERAL` 병렬 | 어느 한쪽이라도 `resultCode=S` AND `data != null` |

### 1.3 응답 코드 패턴 (공통)

| QSP 응답 | password-reset 처리 |
|---|---|
| `resultCode="S"` + `data!=null` + 매칭 일치 | 200 (토큰 + 메일) |
| `resultCode="S"` + `data!=null` + 매칭 불일치 (STORE email mismatch) | 404 (mismatch) |
| `resultCode="S"` + `data=null` | 404 (not found) |
| `resultCode="F_NOT_USER"` | 404 (not found) |
| `resultCode="E"` (TooManyResultsException) | 404 + `console.error` 운영 알림 (fail-closed) |
| HTTP 비정상 / 타임아웃 / 스키마 불일치 | 502 |

---

## 2. API Specification

### 2.1 `POST /api/auth/password-reset/request` (Updated)

**Request Body (변경)**:

```ts
{
  userTp: "STORE" | "SEKO" | "GENERAL" | "ADMIN",
  loginId?: string,
  email?: string,
  // sekoId 필드 제거
}
```

| Field | Type | Required | 비고 |
|---|---|---|---|
| `userTp` | enum | Y | 4종 (ADMIN 은 화면 미사용이지만 enum 유지) |
| `loginId` | string | 조건부 | STORE: 필수 / GENERAL: 단일 입력값 운반용(사실상 필수) / SEKO: 무시 |
| `email` | string | 조건부 | STORE: 필수 / SEKO: 필수 / GENERAL: 비전송 |

**Zod superRefine 정책**:

```ts
.superRefine((data, ctx) => {
  if (data.userTp === "STORE") {
    if (!data.loginId?.trim()) addIssue("loginId", "販売店会員はID入力が必須です");
    if (!data.email?.trim()) addIssue("email", "Eメールは必須です");
  }
  if (data.userTp === "SEKO") {
    if (!data.email?.trim()) addIssue("email", "Eメールは必須です");
  }
  if (data.userTp === "GENERAL") {
    const hasLoginId = !!data.loginId?.trim();
    const hasEmail = !!data.email?.trim();
    if (!hasLoginId && !hasEmail) {
      addIssue("loginId", "IDまたはEメールを入力してください");
    }
    // 둘 다 있어도 허용 — 화면이 loginId 필드로만 보내지만, 백엔드는
    // 어느 쪽으로 들어와도 입력값 X 를 추출하여 dual-key 호출 (관용적 처리)
  }
})
```

**Response**:

| Status | Body | 케이스 |
|---|---|---|
| 200 | `{ data: { message: "パスワード変更リンクをメールで送信しました。" } }` | 매칭 성공 + 토큰/메일 정상 |
| 400 | `{ error: "一致する会員情報がありません。…" }` | Zod 검증 실패 (메시지는 미존재와 동일) |
| 404 | `{ error: "一致する会員情報がありません。…" }` | not found / mismatch / TooManyResults |
| 429 | `{ error: "リクエストが多すぎます。…" }` | rate limit |
| 500 | `{ error: "サーバーエラー…" }` | 토큰 생성 실패 |
| 500 | `{ error: "メールの送信に失敗しました。…" }` | 메일 발송 실패 |
| 502 | `{ error: "外部サーバー…" }` | QSP 비정상/타임아웃/스키마 불일치 |

### 2.2 화면 사양 (`password-reset-popup.tsx`)

| 탭 | 입력란 | 제출 payload |
|---|---|---|
| dealer | ID(text) + E-Mail(email) | `{ userTp: "STORE", loginId, email }` |
| installer | E-Mail(email) | `{ userTp: "SEKO", email }` |
| general | 단일 입력(text) — 라벨 "ID または E-Mail" | `{ userTp: "GENERAL", loginId: <입력값> }` |

추가:
- `isFormValid`:
  - dealer: `id && email` (현행 유지)
  - installer: `email` (sekoId 검사 제거)
  - general: `idEmail` (현행 유지, 단 type 만 text 로 변경)
- `INITIAL_FORM` 의 `sekoId` 필드 제거
- `ResetFormData` 인터페이스에서 `sekoId` 제거
- `MEMBER_TYPES` 라벨/순서 변경 없음

---

## 3. 백엔드 구현 명세

### 3.1 lookup 헬퍼 분리 (의사코드)

`src/app/api/auth/password-reset/request/route.ts` 내부 또는 `src/lib/qsp-password-reset-lookup.ts` 별도 파일(권장 — 단일 책임).

```ts
type LookupOutcome =
  | { kind: "found"; detail: QspUserDetail }
  | { kind: "not-found" }
  | { kind: "ambiguous" }                      // resultCode=E
  | { kind: "transport-error" }
  | { kind: "schema-error" };

async function lookupQspUserForReset(
  params: { loginId?: string; email?: string; userTp: UserTp },
  logTag: string,
  externalSignal?: AbortSignal,
): Promise<LookupOutcome> {
  // accsSiteCd + userTp + (loginId? + email?) URLSearchParams 빌드
  // fetchWithLog 호출 (타임아웃 10s)
  // qspUserDetailResponseSchema.safeParse 로 응답 검증
  // resultCode 분기 → LookupOutcome 매핑
  // detail 반환 시 data.email 평문 포함 (사후 매칭에 사용)
}
```

→ 기존 `email/check` 의 `lookupQspUser` 와 시그니처 유사하지만, **응답 detail 까지 반환**하는 점이 차이 (사후 매칭에 필요).

→ `qspUserDetailResponseSchema` 는 이미 `src/lib/schemas/mypage.ts:161` 에 정의됨. 재사용.

### 3.2 메인 라우트 분기 (의사코드)

```ts
// 기존 1~2-b (Zod / rate limit) 그대로 유지

// 3. userTp 별 검증
let userExists = false;
let resolvedEmail: string | null = null;     // 메일 발송 수신자
let resolvedLoginId: string | null = null;   // 토큰 loginId 컬럼

if (userTp === "STORE") {
  const r = await lookupQspUserForReset(
    { loginId, userTp: "STORE" }, LOG_TAG,
  );
  if (r.kind === "found" && r.detail.email && r.detail.email === email) {
    userExists = true;
    resolvedEmail = r.detail.email;
    resolvedLoginId = r.detail.userId;
  } else if (r.kind === "found") {
    console.warn(`${LOG_TAG} STORE email mismatch — userTp=STORE`);
  } else if (r.kind === "ambiguous") {
    console.error(`${LOG_TAG} STORE TooManyResults — fail-closed`);
  }
}

else if (userTp === "SEKO") {
  const r = await lookupQspUserForReset(
    { email, userTp: "SEKO" }, LOG_TAG,
  );
  if (r.kind === "found" && r.detail.email) {
    userExists = true;
    resolvedEmail = r.detail.email;
    resolvedLoginId = r.detail.userId;
  } else if (r.kind === "ambiguous") {
    console.error(`${LOG_TAG} SEKO TooManyResults — fail-closed`);
  }
}

else if (userTp === "GENERAL") {
  // 입력값 X 추출: loginId 우선, 없으면 email (Zod 가 둘 중 하나는 보장)
  const inputValue = loginId?.trim() || email?.trim() || "";
  // 두 lookup 병렬 + race (email/check 패턴 미러링)
  const ac = new AbortController();
  const p1 = lookupQspUserForReset(
    { loginId: inputValue, userTp: "GENERAL" }, `${LOG_TAG} (lookup#1)`, ac.signal,
  );
  const p2 = lookupQspUserForReset(
    { email: inputValue, userTp: "GENERAL" }, `${LOG_TAG} (lookup#2)`, ac.signal,
  );

  const first = await Promise.race([p1, p2]);
  if (first.kind === "found" && first.detail.email) {
    ac.abort();
    userExists = true;
    resolvedEmail = first.detail.email;
    resolvedLoginId = first.detail.userId;
  } else {
    const [r1, r2] = await Promise.all([p1, p2]);
    const winner =
      (r1.kind === "found" && r1.detail.email) ? r1 :
      (r2.kind === "found" && r2.detail.email) ? r2 : null;
    if (winner && winner.kind === "found") {
      userExists = true;
      resolvedEmail = winner.detail.email!;
      resolvedLoginId = winner.detail.userId;
    } else if (r1.kind === "ambiguous" || r2.kind === "ambiguous") {
      console.error(`${LOG_TAG} GENERAL TooManyResults — fail-closed`);
    }
  }
}

// 4. 미존재 → 404 (일관 메시지)
if (!userExists || !resolvedEmail) {
  console.info(`${LOG_TAG} 회원 미존재/매칭실패 — userTp: ${userTp}`);
  return NextResponse.json(
    { error: "一致する会員情報がありません。入力情報を再度ご確認ください。" },
    { status: 404 },
  );
}

// 5. 토큰 생성 (resolvedEmail 기준) — 기존 트랜잭션 유지
//    rate limit 카운트 키도 resolvedEmail 로 통일 (GENERAL loginId 입력 케이스 정합)
//    ※ 단, 2-b rate limit 은 본 분기 진입 전에 이미 입력 email 기준으로 카운트됐음
//      → GENERAL 의 loginId 입력 케이스는 입력값이 email 형태가 아니라
//        2-b 가 의미 있게 카운트되지 않을 수 있음. 향후 보강 검토 항목.
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
      token: hashedToken,
      expiresAt,
    },
  }),
]);

// 6. 메일 발송 — to: resolvedEmail
await sendMail({ to: resolvedEmail, subject, html });
```

### 3.3 Rate limit 키 정합성 (보강 항목)

현재 `route.ts:60-95` 의 rate limit 은 입력 `email` 기준. GENERAL 의 loginId 입력 케이스(예: 입력값=`user-id-string`)에서는:

1. 2-a (IP rate limit): IP 기반이므로 영향 없음
2. 2-b (이메일별 토큰 카운트): `prisma.passwordResetToken.count({ where: { userId: email } })` — `email` 이 비어있거나 loginId 값이라 의미 약화

→ **본 PR 의 보강안**: GENERAL 분기에서 입력값을 그대로 rate limit 키에 사용하되, 토큰 생성 시점의 `userId` 는 `resolvedEmail` 사용. 2-b 의 count 쿼리도 `resolvedEmail` 기준으로 한 번 더 검사하면 가장 정확하지만, **resolvedEmail 은 QSP 조회 후에야 알 수 있어** rate limit 시점에는 입력값으로만 처리. 추가 카운트 검사는 토큰 생성 직전 단계로 이동 가능.

→ 본 PR 에서는 **2-b 의 count where 조건을 `userId: input || email` 로 일반화** (Zod 가 GENERAL 에서 loginId/email 중 하나는 보장하므로 빈값 발생 안 함). 토큰 카운트가 입력 키 기준으로 일관되게 동작.

### 3.4 응답 스키마 좁히기 (`qspResponseSchema` → `qspUserDetailResponseSchema`)

기존 코드 `route.ts:139` 는 `qspResponseSchema` (`data: z.unknown().nullable()`) 사용 → STORE 사후 매칭 시 `data.email` 추출 시 추가 safeParse 필요.

→ **변경**: `qspUserDetailResponseSchema` (`data: qspUserDetailSchema | null`) 로 교체. 이미 `mypage/profile` 등에서 검증된 스키마. `data.email` 평문이 `z.string().nullable()` 로 정의돼 있어 그대로 사용 가능.

---

## 4. 프론트 구현 명세 (`password-reset-popup.tsx`)

### 4.1 ResetFormData 타입 변경

```diff
 interface ResetFormData {
   id: string;
   email: string;
-  sekoId: string;
   idEmail: string;
 }

 const INITIAL_FORM: ResetFormData = {
   id: "",
   email: "",
-  sekoId: "",
   idEmail: "",
 };
```

### 4.2 isFormValid 변경

```diff
 function isFormValid(tab: TabType, data: ResetFormData): boolean {
   switch (tab) {
     case "dealer":
       return data.id.trim() !== "" && data.email.trim() !== "";
     case "installer":
       return data.email.trim() !== "";
     case "general":
       return data.idEmail.trim() !== "";
   }
 }
```

→ `installer` 분기는 이미 email 만 필수이므로 코드 자체는 변경 없음. `sekoId` 필드 제거에 따른 인터페이스 정합만 정리.

### 4.3 handleSubmit payload 변경

```diff
 switch (activeTab) {
   case "dealer":
     payload.loginId = formData.id;
     payload.email = formData.email;
     break;
   case "installer":
     payload.email = formData.email;
-    if (formData.sekoId.trim()) payload.sekoId = formData.sekoId;
     break;
   case "general":
-    payload.email = formData.idEmail;
+    payload.loginId = formData.idEmail;   // 입력값을 loginId 필드로 전송 (백엔드 dual-key 가 처리)
+    delete payload.email;                  // 또는 빈값으로 두지 않기
     break;
 }
```

**구현 노트**: `payload` 초기화 시 `{ userTp, email: "" }` 로 설정돼 있으나 GENERAL 에서 `email: ""` 로 보내면 Zod 의 `email` 필드(`z.string().email()`) 검증에서 실패할 수 있음. → `payload` 를 `Record<string, string>` 로 두고 GENERAL 분기에서 `email` 키를 아예 빼는 형태로 빌드. 또는 `payload` 초기화를 `{ userTp }` 만으로 하고 케이스별 추가.

→ 권장 리팩터:

```ts
const payload: Record<string, string> = { userTp };
switch (activeTab) {
  case "dealer":
    payload.loginId = formData.id;
    payload.email = formData.email;
    break;
  case "installer":
    payload.email = formData.email;
    break;
  case "general":
    payload.loginId = formData.idEmail;
    break;
}
```

### 4.4 화면 input 변경

#### 4.4.1 SEKO (installer) 탭

```diff
 {activeTab === "installer" && (
   <>
-    <div className="flex flex-col gap-2 w-full">
-      <label className={labelClass}>施工店ID</label>
-      <input type="text" value={formData.sekoId}
-             onChange={(e) => handleChange("sekoId", e.target.value)}
-             className={inputClass} />
-    </div>
     <div className="flex flex-col gap-2 w-full">
       <label className={labelClass}>
         E-Mail<span className="text-[#FF1A1A]">*</span>
       </label>
       <input type="email" value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className={inputClass} />
     </div>
   </>
 )}
```

→ 단일 input 만 남으므로 `<>` Fragment 도 제거 가능 (단 React 18+ 에서는 Fragment 유지가 무해해서 그대로 둬도 무방).

#### 4.4.2 GENERAL (general) 탭

```diff
 {activeTab === "general" && (
   <div className="flex flex-col gap-2 w-full">
     <label className={labelClass}>
-      ID(E-Mail)<span className="text-[#FF1A1A]">*</span>
+      ID または E-Mail<span className="text-[#FF1A1A]">*</span>
     </label>
     <input
-      type="email"
+      type="text"
       value={formData.idEmail}
       onChange={(e) => handleChange("idEmail", e.target.value)}
       className={inputClass}
     />
   </div>
 )}
```

→ `type="text"` 로 변경하는 이유: loginId (이메일이 아닌 문자열) 입력도 받아야 하므로 브라우저의 email-format 검사(`<input type="email">`) 가 차단을 일으키지 않도록.
→ `autoComplete="username"` 추가 권장 (브라우저 패스워드 매니저 호환).

### 4.5 ARIA / 라벨 부가 안내 (선택)

GENERAL 탭에 보조 텍스트 추가 검토:

```jsx
<p className="font-['Noto_Sans_JP'] text-[12px] text-[#999] leading-[1.5]">
  ※ ID または E-Mail のいずれかを入力してください
</p>
```

→ 사용자 사양에 명시적 요청 없으므로 본 PR 범위 외(필요 시 후속).

---

## 5. Zod Schema Specification

### 5.1 변경 후 (`src/lib/schemas/password-reset.ts`)

```ts
export const passwordResetRequestSchema = z.object({
  userTp: userTpSchema,
  loginId: z.string().trim().optional(),
  email: z.string().trim().email("有効なメールアドレスを入力してください").max(100).optional(),
  // sekoId: 필드 자체를 제거
}).superRefine((data, ctx) => {
  if (data.userTp === "STORE") {
    if (!data.loginId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "販売店会員はID入力が必須です", path: ["loginId"] });
    }
    if (!data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eメールは必須です", path: ["email"] });
    }
  }
  if (data.userTp === "SEKO") {
    if (!data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eメールは必須です", path: ["email"] });
    }
  }
  if (data.userTp === "GENERAL") {
    if (!data.loginId && !data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IDまたはEメールを入力してください", path: ["loginId"] });
    }
  }
});
```

**호환성 검토**:
- 기존 `email: z.string().email().max(100)` 필수 → optional 로 변경 = breaking 가능성 (다른 호출자 영향). 현재 `password-reset-popup.tsx` 만 사용. 영향 없음.
- `sekoId` 필드 제거 = breaking. OpenAPI 동시 갱신.

### 5.2 응답 스키마 — `qspUserDetailResponseSchema` 재사용

`src/lib/schemas/mypage.ts:161` 이미 정의된 것을 import 해 사용. import 경로 변경만 발생.

---

## 6. OpenAPI Spec Update (`src/lib/openapi.ts`)

`POST /api/auth/password-reset/request` 의 requestBody 스키마:

```yaml
PasswordResetRequest:
  type: object
  required: [userTp]
  properties:
    userTp:
      type: string
      enum: [STORE, SEKO, GENERAL, ADMIN]
    loginId:
      type: string
      description: |
        STORE: 必須 (会員ID)
        GENERAL: 必須 (ID または E-Mail いずれか — 単一入力値)
        SEKO: 不使用
    email:
      type: string
      format: email
      description: |
        STORE: 必須 (会員のEメール)
        SEKO: 必須
        GENERAL: 不使用 (loginId フィールドに入力値を運搬)
  description: |
    ユーザー種別ごとの入力ポリシー:
      - STORE: loginId + email (両方必須、同一会員にマッチした場合のみ通過)
          バックエンドは loginId 単独で QSP userDetail を照会し、応答の email 平文と入力 email が一致する場合のみ通過。
      - SEKO: email のみ必須
      - GENERAL: 単一入力値 X を loginId フィールドで送信。
          バックエンドは X を loginId 単独 / email 単独で並列照会し、いずれか hit すれば通過。
```

기존 `sekoId` 필드 제거. 응답 코드(200/400/404/429/500/502) 는 변경 없음.

---

## 7. 보안 / PII / 로깅 정책 준수

| 항목 | 정책 | 본 PR 적용 |
|---|---|---|
| PII 미로깅 | `.claude/rules/api.md` — 이메일 평문 로깅 금지 | `maskEmail` 적용 유지 |
| 사용자 열거 방어 | 미존재/mismatch 동일 메시지 | "一致する会員情報がありません" 통일 |
| Zod 검증 실패 메시지 | 일본어 (유저 대면) | 본 PR 의 일본어 메시지 유지 |
| QSP 에러 직접 노출 금지 | 일반화 메시지 | resultCode "E" 도 동일 404 메시지 |
| timing 공격 | OTP/해시 비교 시 `timingSafeEqual` | 본 라우트는 평문 string 비교(email) — 신규 위험 없음 |
| 최소권한 fail-closed | 권한/조회 결과 판정 실패 시 차단 | TooManyResults / mismatch 모두 차단 |
| Route Handler 최상위 try-catch | 필수 | 기존 유지 (`route.ts:24, 237`) |

---

## 8. Test Strategy

### 8.1 Unit-equivalent (수동 재현)

각 케이스 dev 환경에서 실제 호출 → response status + body + 메일 발송 여부 확인.

| Case | userTp | 입력 | 기대 status | 기대 동작 |
|---|---|---|---|---|
| T-1 | GENERAL | `rjy1537@naver.com` (등록 회원) | 200 | 토큰 생성 + 메일 발송 to `data.email` |
| T-2 | STORE | loginId=`A03`, email=`kjy0501@nate.com` (mismatch) | 404 | 토큰/메일 없음 + warn 로그 |
| T-3 | GENERAL | `kkk@dd.dd` (미등록) | 404 | 변화 없음 (현행 유지) |
| T-4 | STORE | loginId+email 동일 회원 매칭 | 200 | 토큰 + 메일 |
| T-5 | STORE | loginId 등록 + email 빈 값 | 400 | Zod 실패 |
| T-6 | STORE | loginId 등록 + email 다른 회원 것 | 404 | mismatch + warn |
| T-7 | SEKO | 등록 email | 200 | 토큰 + 메일 |
| T-8 | SEKO | 미등록 email | 404 | 변화 없음 |
| T-9 | GENERAL | loginId 입력 (loginId ≠ email) | 200 | 메일은 응답 `data.email` 로 발송 |
| T-10 | GENERAL | email 형식 입력 | 200 | dual-key 의 email 매칭 hit |
| T-11 | GENERAL | 빈 값 | 400 | Zod 실패 |
| T-12 | GENERAL | TooManyResults 유발 데이터 | 404 | console.error 로깅 |

### 8.2 인터페이스 로그 검증 (qp_interface_log)

각 케이스 후 `qp_interface_log` 에서 확인:
- T-1: lookup#1 (loginId) 또는 lookup#2 (email) 어느 쪽이 hit 했는지
- T-2: lookup 1건 + 사후 mismatch warn 로그 (DB 기록 없음, 콘솔만)
- T-9: lookup#1 (loginId) hit, lookup#2 (email) abort 또는 not-found

### 8.3 회귀 — 기존 토큰 흐름

본 PR 은 `verify`, `confirm` 라우트를 변경하지 않음. 그러나 `passwordResetToken.userId` 가 항상 평문 email 로 저장되는 정합은 유지되어야 함 (`confirm` 라우트가 email 기준으로 토큰 조회).

→ T-9 (GENERAL loginId 입력) 시 `passwordResetToken.userId` = `data.email` (응답 평문) 로 저장됨을 명시적으로 검증.

### 8.4 빌드 / 타입 / 린트

서브에이전트로 일괄 검증:
- `pnpm lint` 오류 0
- `pnpm tsc --noEmit` 오류 0
- `pnpm build` 성공

---

## 9. Migration / Rollback

### 9.1 DB 마이그레이션

없음. `passwordResetToken` 테이블 스키마 변경 없음.

### 9.2 Rollback 전략

본 PR 의 라우트 변경은 단일 파일(`request/route.ts`) + 단일 컴포넌트(`password-reset-popup.tsx`) + 단일 스키마(`password-reset.ts`) + OpenAPI. **revert 만으로 롤백 가능**.

DB 데이터에는 영향 없음 (토큰 형식 동일).

### 9.3 운영 모니터링

배포 후 24h:
- `qp_interface_log` 에서 `apiName='userDetail'` + `caller_route='[POST /api/auth/password-reset/request]'` 의 응답 분포 확인:
  - resultCode `S` 비율
  - resultCode `E` 발생 (TooManyResults — 운영 진단 신호)
  - HTTP 502 발생 빈도
- `console.error` 로그 모니터링:
  - `STORE TooManyResults`
  - `SEKO TooManyResults`
  - `GENERAL TooManyResults`

---

## 10. Open Issues

| ID | Issue | Severity | Status |
|---|---|---|---|
| OI-1 | Rate limit 2-b 카운트 키 — GENERAL loginId 입력 케이스에서 입력값(=loginId)으로 카운트하는 것이 의미가 정확한지 / `resolvedEmail` 기준 추가 카운트 도입 여부 | Medium | Plan §5.4 / Design §3.3 — 본 PR 에서 단순화로 입력값 키 사용. 후속 보강 가능 |
| OI-2 | GENERAL 의 `data.email` 이 null 인 경우 (응답 스키마상 nullable) — 메일 수신자 부재로 발송 불가 → 본 PR 은 fail-closed (404). 정상 회원이라면 `data.email` 평문이 항상 있다고 가정해도 되는지 | Medium | dev 검증 시 확인. 정상 케이스에서 null 발생 시 운영 알림 추가 |
| OI-3 | ADMIN userTp 케이스 — 화면에 ADMIN 탭이 없으나 enum 에는 존재. 라우트가 ADMIN 입력을 받았을 때 어느 분기로 가는지 미정의 | Low | 본 PR 에서 ADMIN 은 STORE 와 동일 정책(loginId+email 모두 필수, 사후 매칭) 적용 권장. 또는 명시적 400 처리 |
| OI-4 | `qspResponseSchema` (data: unknown) 를 사용하는 다른 라우트들의 영향 | Low | 본 PR 은 단일 라우트만 좁힌 스키마로 교체. 다른 라우트는 변경 없음 |

---

## 11. Implementation Checklist

- [ ] `src/lib/schemas/password-reset.ts` — `passwordResetRequestSchema` superRefine 재정의, `email` optional 화, `sekoId` 제거
- [ ] `src/app/api/auth/password-reset/request/route.ts` — userTp 분기 + lookup 헬퍼 + 사후 매칭 + GENERAL 병렬
- [ ] `src/components/popup/password-reset-popup.tsx` — `ResetFormData`/`INITIAL_FORM` 의 `sekoId` 제거, SEKO 입력란 단일화, GENERAL 라벨/타입 변경, payload 빌드 변경
- [ ] `src/lib/openapi.ts` — passwordResetRequest 스펙 동기화
- [ ] (선택) `src/lib/qsp-password-reset-lookup.ts` 신규 헬퍼 분리 (단일 책임 + 재사용성)
- [ ] dev 환경 T-1 ~ T-12 재현 테스트
- [ ] 린트/타입/빌드 통과
- [ ] OpenAPI 스펙과 실제 동작 일치 확인

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-05-06 | Initial draft (Plan v0.1 기반, email/check 라우트의 dual-key 패턴 미러링) | CK |
