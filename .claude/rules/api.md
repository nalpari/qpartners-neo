---
globs:
  - "src/app/api/**/*.ts"
  - "src/lib/schemas/**"
  - "src/lib/mailer.ts"
  - "src/lib/jwt.ts"
  - "src/lib/auth.ts"
  - "src/lib/config.ts"
  - "src/lib/openapi.ts"
---
### API 개발 규칙

#### 새 기능 추가 순서
1. `prisma/schema.prisma`에 모델 정의 → `pnpm prisma migrate dev --name <name>`
2. `src/lib/schemas/`에 Zod 스키마 작성
3. `src/app/api/`에 Route Handler 추가
4. `src/lib/openapi.ts`에 스펙 추가/업데이트 (프론트 api-docs 연동)
5. 페이지 컴포넌트 생성 (`src/app/` 하위)

#### HTTP Client
- `src/lib/axios.ts` — `baseURL: "/api"` 설정된 공용 인스턴스
- 클라이언트 컴포넌트에서 API 호출 시 사용

---

### 보안 (PR 리뷰 반복 지적 사항)

#### PII·민감정보 로깅 금지
- 이메일 주소를 로그에 기록하지 않음 — `userTp` 등 비식별 정보만 사용
- 토큰·비밀번호 등 민감값은 prefix만 로깅: `token.slice(0, 8)`
- `.catch()` 콜백 내부 로그에서도 동일 적용

#### HTML 이메일 XSS 방지
- 사용자 입력(이름, 이메일 등)을 HTML 템플릿에 삽입 시 반드시 `escapeHtml()` 사용
- URL은 `https://` 스킴 검증 추가

#### 외부 API 비밀번호 전송
- QSP 등 외부 API에 비밀번호 전송 시 HTTPS 검증 필수
- dev 환경 http 허용 시 `NODE_ENV`로 분기

#### 사용자 열거(User Enumeration) 방지
- 회원 존재 여부를 응답으로 구분 불가하게 설계 (동일 200 반환)
- rate limit은 토큰 생성이 아닌 **요청 자체 기준**으로 적용 (IP 기반 + 이메일 기반)

#### QSP 에러 메시지 직접 노출 금지
- QSP 내부 에러(SQL 에러 등)가 클라이언트에 전달될 수 있음
- 일반화된 에러 메시지로 변환, 원본은 `console.error`에만 기록

#### 인증 코드 비교
- OTP·해시 비교 시 `crypto.timingSafeEqual` 사용 (타이밍 공격 방어)

#### 최소 권한 원칙
- 권한 판별 시 null/예외값은 **더 낮은 권한**으로 폴백 (fail-closed)
- 미지의 userTp 값은 GENERAL 폴백 금지 → 파싱 실패로 처리

---

### Zod 검증 패턴

#### 외부 API 응답 검증 필수
- QSP 등 외부 API 응답에 `as` 타입 단언 금지
- 반드시 Zod `safeParse`로 검증 → 실패 시 502 반환
```typescript
const parsed = schema.safeParse(qspBody);
if (!parsed.success) {
  console.error("[API] QSP 응답 스키마 불일치:", parsed.error.issues);
  return NextResponse.json({ error: "外部サーバーの応答を処理できません" }, { status: 502 });
}
```

#### transform 내 에러 처리
- `transform` 내부에서 `throw` 금지 — `safeParse` 시 uncaught exception 발생
- `ctx.addIssue` + `return z.NEVER` 사용
```typescript
z.string().transform((val, ctx) => {
  const parsed = z.enum(values).safeParse(val);
  if (parsed.success) return parsed.data;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown value: ${val}` });
  return z.NEVER;
})
```

#### 조건부 필수 검증
- 사용자 유형별 필수 필드는 `superRefine`으로 검증 (STORE → loginId, SEKO → sekoId 등)

#### 비밀번호 스키마 일관성
- 모든 비밀번호 필드에 `.min()` + `.max()` 동일 적용 (signup과 password-reset 간 불일치 방지)

#### confirmPwd 제거
- `.transform(({ confirmPwd: _, ...rest }) => rest)` 로 검증 후 제거 — QSP 전송·로깅 누출 방지

#### 중복 정의 금지
- `userTpValues` 등 공유 값은 `src/lib/schemas/common.ts`에서 단일 정의 후 import

---

### 에러 처리

#### bare catch 금지
```typescript
// ❌
try { body = await request.json(); } catch { ... }
// ✅
try { body = await request.json(); } catch (error) {
  console.warn("[API] Request body 파싱 실패:", error);
  ...
}
```

#### 메일 발송은 await 필수
- `sendMail().catch()` fire-and-forget 금지 (2FA 등 사용자가 수신 기대하는 경우)
- `await sendMail()` + try-catch → 실패 시 500 응답
- password-reset처럼 이메일 열거 방지가 필요한 경우만 예외 (동일 응답 유지하되 로깅)

#### .catch() 콜백 타입
```typescript
// ❌ 암시적 any
.catch((dbError) => { ... })
// ✅
.catch((dbError: unknown) => { ... })
```

#### 설정 에러 전파
- 환경변수 누락 등 설정 에러는 `ConfigError` 커스텀 클래스로 구분
- 문자열 매칭(`error.message.includes("...")`) 금지 — `instanceof` 사용
- 어떤 환경변수가 누락됐는지 에러 메시지에 명시

#### 미구현 기능
- 아무것도 저장하지 않으면서 200 성공 반환 금지
- 미구현 기능은 501 응답 + 명확한 메시지

#### 토큰 롤백
- 토큰 소모 후 후속 처리 실패 시 반드시 `rollbackToken()` 호출
- 모든 에러 경로에서 롤백 누락 여부 확인

---

### OpenAPI 스펙 동기화

- **API route 구현/수정 시 `src/lib/openapi.ts` 필수 업데이트**
- 실제 동작과 스펙 불일치 금지 (예: 코드에서 200 반환인데 스펙에 404 정의)
- description에도 실제 동작 반영

---

### 날짜·타임존

- QSP 등 외부 API 날짜 파싱 시 타임존 명시 필수
```typescript
// ❌ 타임존 미지정 — 서버 환경에 따라 다르게 해석됨
new Date("2026-04-01T10:30:00")
// ✅ JST 명시
new Date("2026-04-01T10:30:00+09:00")
```

---

### 로그 규칙

- API 로그 메시지는 **한국어**, 유저 대면 메시지는 **일본어**
- 로그 prefix: `[METHOD /api/path]` 형식
- 에러 로그에 디버깅 컨텍스트 포함 (status, userTp 등) — 단, PII 제외
- 환경변수 미설정 시 `console.warn`으로 경고 (silent fallback 금지)

---

### SMTP 설정

- `secure: false` 사용 시 `requireTLS: true` 필수 (STARTTLS 다운그레이드 공격 방지)
- 누락 환경변수명을 에러 메시지에 포함
- `SMTP_PORT` 유효성 검증: `Number.isInteger(port) && port > 0 && port <= 65535`
