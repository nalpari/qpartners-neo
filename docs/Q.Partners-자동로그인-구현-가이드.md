# Q.Partners 자동로그인 구현 가이드

외부 사이트(HANASYS DESIGN / Q.Order / Q.Musubi)에서 Q.Partners 로 자동로그인 진입을 구현하기 위한 사양 문서입니다.
- **Document version**: 1.2 (2026-05-21)
- **v1.2 변경**: 키 환경변수명 `AUTO_LOGIN_INBOUND_AES_KEY` → `AUTO_LOGIN_AES_KEY` 통일 (outbound 와 단일 공통 키 운영으로 일치)

---

## 1. 한눈에 보는 흐름

1. 외부 사이트가 사용자 ID 를 암호화해 `autoLoginParam1` 생성
2. Q.Partners 진입 URL 로 리다이렉트
3. Q.Partners 가 cipher 복호화 → QSP `userDetail` 조회 (사용자 존재·활성 검증)
4. 성공 → JWT 발급 후 홈(`/`) 이동
5. 실패 → `/login?error=auto_login_failed` 로 폴백

---

## 2. 호출 URL

```text
GET https://{host}/api/auth/auto-login/inbound?autoLoginParam1={URL_ENCODED_CIPHERTEXT}&userTp={USER_TP}
```

| 환경 | `{host}` |
|---|---|
| Development | `dev.q-partners.q-cells.jp` |
| Production | `prod.q-partners.q-cells.jp` |

### 쿼리 파라미터 (모두 필수)

| 파라미터 | 설명 |
|---|---|
| `autoLoginParam1` | URL 인코딩된 cipher (§3 참고) |
| `userTp` | `ADMIN` / `STORE` / `SEKO` / `GENERAL` 중 하나 |

### `userTp` 별 cipher 평문 식별자

| `userTp` | cipher 평문에 실어야 할 값 |
|---|---|
| `ADMIN` / `STORE` / `SEKO` | **`loginId`** |
| `GENERAL` | **`email`** |

값이 엇갈리면 사용자 검증 실패로 폴백됩니다.

---

## 3. 암호화 사양

```text
plaintext   = UTF-8(userId)
aesKey      = UTF-8(AUTO_LOGIN_AES_KEY)                // 정확히 16 byte raw, KDF 없음
iv          = UTF-8(`${YYYYMMDD_KST}_autoL!!`)         // 16 byte 결정적
ciphertext  = AES-128-CBC(aesKey, iv, plaintext)       // PKCS5/PKCS7 Padding
cipher      = Base64(ciphertext)                       // IV prepend 없음
autoLoginParam1 = encodeURIComponent(cipher)
```

| 항목 | 값 |
|---|---|
| 알고리즘 | **AES-128-CBC** + PKCS5/PKCS7 |
| Key | `AUTO_LOGIN_AES_KEY` — 정확히 16 byte UTF-8 raw. **outbound 와 단일 공통 키** (QSP / Q.Order / Q.Musubi / Design 4개 시스템과 동일 키) |
| IV | `YYYYMMDD_autoL!!` (KST 기준, 16 byte 결정적) |
| 출력 | Base64(ciphertext) — **IV prepend 없음** |
| 자정 경계 | Q.Partners 가 전일 IV 자동 재시도 — 외부 측 추가 처리 불요 |

---

## 4. 샘플 코드 (Node.js)

```javascript
const crypto = require("node:crypto");

function encryptAutoLoginUserId(userId, autoLoginAesKey) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyymmdd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}${String(kst.getUTCDate()).padStart(2, "0")}`;

  const key = Buffer.from(autoLoginAesKey, "utf8");          // 16 byte
  const iv  = Buffer.from(`${yyyymmdd}_autoL!!`, "utf8");    // 16 byte

  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  const ciphertext = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);

  return encodeURIComponent(ciphertext.toString("base64"));
}

// 사용 예
const autoLoginParam1 = encryptAutoLoginUserId("1301011", process.env.AUTO_LOGIN_AES_KEY);
const userTp = "ADMIN";
const redirectUrl = `https://dev.q-partners.q-cells.jp/api/auth/auto-login/inbound?autoLoginParam1=${autoLoginParam1}&userTp=${userTp}`;
```

> Java 등 다른 언어 샘플 / 알고리즘 byte-level 검증 데이터는 필요 시 별도 요청 부탁드립니다.

---

## 5. 외부 측 구현 체크리스트

- [ ] `AUTO_LOGIN_AES_KEY` 를 안전한 시크릿 저장소에 저장. 정확히 16 byte UTF-8 (앞뒤 공백·개행 주의). **outbound (Q.Partners→외부) 와 동일한 단일 공통 키** — 별도 inbound 전용 키 없음
- [ ] 알고리즘은 **AES-128-CBC** + PKCS5/PKCS7. AES-256 / GCM / CTR 사용 금지
- [ ] IV 는 결정적 `YYYYMMDD_autoL!!` (KST 기준 16 byte) — 랜덤 IV 생성 금지
- [ ] cipher 페이로드는 **ciphertext only**, IV prepend 금지
- [ ] `encodeURIComponent` 한 번만 적용 (이중 인코딩 금지)
- [ ] `autoLoginParam1` + `userTp` **모두 필수** 쿼리로 호출
- [ ] `userTp` 별 cipher 평문 식별자 매핑 준수 (`ADMIN/STORE/SEKO=loginId`, `GENERAL=email`)
- [ ] `SUPER_ADMIN` 권한 사용자는 자동로그인 미지원 — 외부 측 메뉴 가드 권장
- [ ] KST(UTC+09:00) 명시적 적용 (서버 OS 타임존 의존 금지)
- [ ] **HTTPS 로만 호출**
- [ ] 실패 시 Q.Partners 가 `/login?error=auto_login_failed` 로 폴백 — 외부 측 별도 폴백 처리 불요

---

## 6. 사전 합의 사항 ★

본 구현 전 외부 측에서 확인 부탁드립니다.

1. **외부 측 사용자 DB 에 Q.Partners 사용자 정보 (userTp + loginId/email) 보유 여부**
   - 보유 메커니즘은 외부 측에서 결정
   - Q.Partners 측에서 QSP `userDetail` 조회를 담당 → 외부 측 QSP 직접 호출 불요

2. **Q.Partners 미가입자 처리**
   - 자동로그인 메뉴 노출 가드 또는 Q.Partners 폴백 페이지로 이동

3. **SEKO (시공점) 사용자 — dev 환경 제약**
   - dev 는 SEKO 가 QSP 마이그 전 상태라 자동로그인 실패. **운영 환경에서만 정상 동작.**
   - dev 통합 테스트에서는 SEKO 검증 제외 부탁드립니다.

---

## 7. 보안 인지 사항

### 7.1 같은 사용자는 하루 동안 cipher 가 바뀌지 않습니다 (24h 재사용 가능)

- **이유**: IV 가 `YYYYMMDD_autoL!!` 라서 같은 키 + 같은 userId + 같은 날짜 = 항상 같은 ciphertext 생성. 즉 한 번 만든 `autoLoginParam1` 이 자정까지 그대로 유효합니다.
- **Q.Partners 측 정책**: 같은 cipher 로 24h 안에 여러 번 진입해도 모두 통과시킵니다 (1회용 차단 없음).
- **위험**: cipher 가 어딘가에서 유출되면 (브라우저 주소창 캡처 / 히스토리 / Referer 헤더 / 서버 액세스 로그 등) **24h 안에 누구든 그 사용자로 자동로그인 진입 가능**합니다.
- **권장 대응**:
  - 호출은 **반드시 HTTPS** 로만
  - 진입 URL 이 노출되는 표면(서버 로그·접근 로그) 마스킹 / 접근 권한 제한
  - 자정 직전에 cipher 를 만들었다가 자정이 지나도 Q.Partners 측이 **전일 IV 로 자동 재시도** 하므로, 외부 측 별도 처리는 불필요

### 7.2 호출 횟수 제한 — IP 당 1분 20건 (Rate Limit)

- **Q.Partners 측 정책**: 호출자 IP 기준 1분 20건 초과 시 거부 → 폴백.
- **외부 측 호출 패턴별 영향**:
  - 사용자 브라우저가 직접 호출 (각자 다른 IP) → **문제 없음**
  - 외부 측 백엔드 서버가 cipher 만든 뒤 서버측에서 호출 (모두 같은 NAT IP) → **한도 초과 가능**
- **권장 대응**: 백엔드 호출 패턴이라면 발송 회신 시 **귀사 호출 IP 와 예상 트래픽량** 알려주세요. 필요 시 한도 상향 또는 IP allowlist 협의 가능합니다.

### 7.3 키 운영 — 단일 공통 키 (방향·환경 무관)

- `AUTO_LOGIN_AES_KEY` 는 **inbound (외부→Q.Partners) / outbound (Q.Partners→외부) 양방향 동일** + **dev / 운영 환경 공통** 으로 단일 키를 사용합니다.
- 외부 4개 시스템 (QSP / Q.Order / Q.Musubi / Design) 자동로그인 키 운영 관례와 통일.
- 키 값은 **별도 보안 채널로 1회 송부** → 귀사 dev / 운영 환경 양쪽 env 에 동일하게 설정.
- 키 교체가 필요한 경우 (정기 교체 / 침해 의심 등) **사전 공지 후 양측이 동시에** 새 키로 교체합니다.
  - 교체 후에는 양측 모두 **프로세스(컨테이너) 재시작** 이 필요합니다. Q.Partners-neo outbound 구현은 키를 프로세스 메모리에 1회 캐싱하므로, env 만 바꾸면 stale key 가 그대로 유지됩니다. rolling restart 환경에서는 모든 인스턴스 재기동 완료까지 일시적 양방향 cipher 불일치가 발생할 수 있어 점검창 협의 권장.
- ⚠️ **키 값 공개 채널 노출 절대 금지** — 단일 공통 키 운영이므로 키 1건이 노출되면 **외부 4개 시스템 + Q.Partners 양방향** 전체가 동시에 영향을 받습니다. 이메일/메신저/티켓/PR 본문/소스 주석/커밋 메시지/스크린샷 등 영구 보존되는 표면에 키 값을 절대 기록하지 마세요. 공유는 반드시 별도 보안 채널(예: 사내 비밀저장소·암호화된 1회용 링크) 로만 진행합니다.
- (이력) 2026-04-30 ~ 2026-05-20 기간에는 Q.Partners 측이 inbound/outbound 키를 분리 운영했으나 (`AUTO_LOGIN_INBOUND_AES_KEY` / `AUTO_LOGIN_OUTBOUND_AES_KEY`), 통합 테스트 단계에서 외부 4개 시스템 운영 사양과의 충돌이 확인되어 2026-05-21 부터 단일 키로 통일했습니다.

---

## 8. 프로세스 다이어그램

```mermaid
flowchart TD
    A[외부 사이트: 사용자 ID 확보] --> B[AES-128-CBC 암호화]
    B --> C[Base64 → encodeURIComponent → autoLoginParam1]
    C --> D[브라우저 리다이렉트: Q.Partners 진입 URL]
    D --> E{autoLoginParam1, userTp 검증}
    E -- 실패 --> X[/login?error=auto_login_failed]
    E -- 성공 --> F[cipher 복호화 당일 IV → 실패 시 전일 IV 재시도]
    F -- 실패 --> X
    F -- 성공 --> G[QSP userDetail 조회]
    G --> H{사용자 존재 + statCd=A + SUPER_ADMIN 아님?}
    H -- 실패 --> X
    H -- 성공 --> I[Q.Partners JWT 발급 → 302 / 홈]
```

