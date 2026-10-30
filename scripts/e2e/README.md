# E2E 검증 스크립트

검색 계통(통합검색 자동완성 · 실시간 리스트 검색 · 좌측영역 분류축 · 형번관리)의 화면 동작을
브라우저로 돌려 확인한다.

## 왜 프레임워크가 없나

이 레포에는 테스트 프레임워크가 들어 있지 않다 — `package.json` 의 `scripts` 에 `test` 가 없고
jest·vitest·playwright 의존성도 없다. `package.json` 수정은 별도 담당자 영역이라,
**의존성을 늘리지 않고** 돌아가는 형태로 두었다.

- 런타임: node 표준 + 이미 들어 있는 `jose`(JWT 발급)
- 브라우저 구동만 Playwright 가 필요하고, **레포에 설치하지 않고 외부 설치본을 가리킨다**

정식 도입(vitest/playwright + CI 단계)이 결정되면 이 스크립트들은 그 러너로 옮기면 된다.
스펙 내용 자체는 그대로 쓸 수 있다.

## 전제 2가지

1. **dev 서버가 떠 있을 것** — `pnpm dev` (기본 `http://localhost:3000`).
   `E2E_BASE_URL` 로 바꿀 수 있다.
2. **Playwright 설치본 경로** — `PLAYWRIGHT_PATH` 환경변수.
   레포 `node_modules` 에 `playwright` 가 있으면 그걸 먼저 쓰므로 생략해도 된다.

로그인은 **QSP 를 거치지 않는다.** `.env.development` 의 `JWT_SECRET` 으로 역할별 토큰을
직접 발급해 쿠키(`qp-auth-token`)에 넣는다. 검색 계통 화면·API 는 QSP 를 타지 않으므로
2FA 없이 돌아간다. 다만 **개발 DB 접속에는 VPN 이 필요하다** — VPN 밖에서는 DB 가 IP 로
거부해(`ER_HOST_NOT_PRIVILEGED`) 전 케이스가 「건수를 읽지 못했다」로 깨진다.

## 실행

```bash
# 전체
PLAYWRIGHT_PATH=/path/to/playwright node scripts/e2e/run-all.mjs

# 스펙 하나만
PLAYWRIGHT_PATH=/path/to/playwright node scripts/e2e/search-realtime.e2e.mjs
```

Windows PowerShell:

```powershell
$env:PLAYWRIGHT_PATH = "C:\path\to\playwright"
node scripts/e2e/run-all.mjs
```

실패가 하나라도 있으면 종료코드 1 이다. 결과는 `PASS` / `FAIL` / `SKIP` 세 가지다 —
`SKIP` 은 **검증 전제가 성립하지 않아 판정할 수 없는** 경우이고, 전제가 갖춰지면 자동으로
다시 검증된다(아래 「현재 건너뛰는 케이스」).

## 스펙

| 파일 | 건수 | 대상 |
|---|---|---|
| `search-suggest.e2e.mjs` | 14 | 자동완성 드롭다운 — 3자 게이트, `[製品]`→`[資料]` 순, 적중 0건 비표시, 후보 클릭 이동, 바깥 클릭·`Escape` 닫힘, 진입 시 미조회, 비로그인, a11y role, **키보드 조작**(↓/↑ 선택 → Enter 이동 / 미선택 Enter 는 검색) |
| `search-realtime.e2e.mjs` | 8 | 실시간 리스트 검색 — 3자 이상 자동 조회, 2자 이하 미조회, **3자 미만으로 지우면 검색어만 빼고 현재 조건으로 재조회**(분류축은 유지), 디바운스 1회, Enter 는 글자수 무관, 자동완성과 공존, 건수 요소 교체(브라우저 번역 대응) |
| `search-facets.e2e.mjs` | 6 | 좌측영역 분류축 (§27.3) — **초기 진입은 전 축 전부 체크 + 건수 표시**, **한 축 전해제는 0건이 아니라 더 넓어짐**(회귀 방어), 선택지를 줄이면 좁혀지고 전해제로 복귀, 축 사이 AND, `すべて解除` 로 전 축을 조건에서 뺌, `すべて選択` 은 미설정과 **같은 조건**. 축·선택지는 **DOM 순서로 집고 카테고리 명칭을 코드에 박지 않는다** |
| `content-required-axes.e2e.mjs` | 5 | 콘텐츠 **축별 필수 분류** — `情報種別`·`製品分類`·`製品ステータス` 각 1개 이상. 비표시 축은 요구하지 않음. ⚠️ 개발 DB 에 draft 자료를 만들고 지운다(`[E2E-REQ]`) |
| `resilience.e2e.mjs` | 5 | 조회 실패 시 화면 — `PAGE_SIZE` 실패 시 **재시도 버튼**(운영자 미등록 상태와 구분), 재시도로 복구, 목록·형번관리 건수가 실패 시 `0` 이 아니라 `-` |
| `admin-product-models.e2e.mjs` | 5 | 형번관리 CRUD — 행 클릭 편집 진입, `新規` 초기화, 등록→수정→삭제 반영, 동일 카테고리 중복 거부, 비관리자 차단. ⚠️ **개발 DB 에 형번을 실제로 만들고 지운다**(`E2E-TMP-` 접두사) |

합계 **43케이스**.

## 대기 방식 — 이 스크립트의 핵심 규칙

고정 대기(`waitForTimeout`)로 조회 결과를 읽으면, 응답이 그보다 늦을 때 **직전 값**을 읽는다.
그러면 같은 테스트가 단독 실행에서는 통과하고 전체 실행에서는 실패한다. 2026-10-26~27 에
이 때문에 같은 스펙이 6/6 → 4/6 → 0/6 으로 흔들렸다. 안정적으로 틀린 값이 나오면 처음보다
판단이 어려워진다.

그래서 이렇게 나눈다.

| 상황 | 수단 |
|---|---|
| 조회가 **일어나야** 하는 조작 | `actAndWait` / `actAndSettle` — 응답을 기다린 뒤 값이 안정될 때까지 폴링 |
| 조회가 **일어나면 안 되는** 조작 (2자 게이트, 디바운스 횟수) | 고정 대기를 **의도적으로** 쓴다. 기다릴 응답이 없다 |
| 화면 이동 | `page.waitForURL` |
| 실패 표시(`-`)·재시도 버튼 | 그 상태가 될 때까지 폴링 (`waitForText` / `waitForSelector`) |

함정 3가지가 실측으로 확인됐다.

1. **대기자는 조작 *전에* 등록해야 한다.** 조작 뒤에 `networkidle` 부터 기다리면 「요청이 아직
   시작되지 않은 순간」을 유휴로 오판해 조회 전 값을 확정한다.
2. **`goto` 의 `waitUntil` 은 `domcontentloaded`.** dev(Turbopack)에서 `networkidle` 은
   32~34초가 걸린다(`domcontentloaded` 는 5.4초). 30초가 케이스마다 붙어 메모리 압박까지 받았다.
3. **`domcontentloaded` 직후에는 React 가 아직 붙지 않았다.** 그 상태의 `el.click()` 은 아무
   일도 하지 않는다. 그래서 진입 헬퍼는 **첫 조회 응답을 하이드레이션 신호로** 쓴 뒤 조작하고,
   탭 전환은 `aria-selected` 로 실제로 바뀌었는지 확인한다.

브라우저는 스펙 파일당 **한 번만 띄워 재사용**한다(`withPage` → 공용 browser + 케이스별
`context`). 격리는 context 가 담당하므로 쿠키·storage 는 케이스 간에 넘어가지 않는다.

## 테스트 데이터

`search-realtime.e2e.mjs` 와 `search-suggest.e2e.mjs` 는 개발 DB 에 다음이 있다는 전제다.

- 제목에 `PHASE9-TEST` 가 들어간 published 자료 3건 (형번 연결 1·2·3건)
- 형번 `Q.TRON …` · `Re.RISE …` · `HQJP-A44-1`

없으면 「목록이 걸러지지 않았습니다」·「후보가 0건입니다」로 실패한다. 투입·롤백은
`docs/01-plan/features/search-enhancement.plan.md` §19 「검증 데이터」 참조.

**건수는 절대값으로 단언하지 않는다.** 개발 DB 는 5개 축에 모두 분류를 가진 published 자료가
2,459건 중 21건뿐이고, 형번이 연결된 자료는 7건(축 커버리지 최대 3개)이다. 그래서 전 축에
조건이 걸리면 자료일람은 21건, 제품일람은 0건이 된다 — **구현 문제가 아니라 데이터 상태다**
(2026-10-26 실측). 분류축 스펙이 자료일람 탭에서만 도는 이유도 이것이다.

## 현재 건너뛰는 케이스

| 스펙 | 케이스 | 사유 |
|---|---|---|
| `content-required-axes` | 표시되지 않는 축은 필수로 보지 않는다 | 축 5개가 **전부 표시 중**이라 「비표시 축」이 없다. 폐지 대상인 `業務分類`(BIZ) 의 데이터 정리가 끝나면 자동으로 검증된다 |

## 주의

- 화면 선택자는 `data-testid` 를 쓴다(`result-total`, `product-models-total`).
  표기(`2,422`)가 바뀌어도 안 깨지게 하기 위함이다.
- 카테고리 명칭을 코드에 박지 않는다. 폐지된 `業務分類`·`内容分類` 상수로 스펙이 깨진 선례가 있다.
- 전체 실행에 **3~5분** 걸린다(실측 2026-10-27). 케이스당 3~20초.
- ⚠️ **dev 서버를 며칠씩 켜 두면 Next 내부 워커가 죽는다.** 그러면 특정 route 만
  `Error: Jest worker encountered 2 child process exceptions` 와 함께 **HTML 500** 을 돌려주고,
  코드 결함처럼 보인다(2026-10-27 — 4일 가동한 서버에서 `PUT/DELETE /api/product-models/:id`
  가 전부 500). API 응답이 JSON 이 아니라 HTML 이면 **먼저 dev 서버를 재시작**할 것.
  재시작만으로 전체 실행 시간이 분 단위에서 초 단위로 줄기도 한다.
