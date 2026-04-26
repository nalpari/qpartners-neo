/**
 * 대량메일 테스트용 redirect — 실제 수집된 수신자 이메일을 환경변수에 정의된 테스트 메일주소로 강제 치환.
 *
 * **목적**: 로컬/개발 환경에서 진짜 회원에게 메일이 나가는 사고를 막고, authRole 별로 누가
 * 어떤 메일을 받게 되는지 검증할 수 있도록 4명의 인터플러그 계정에만 발송하기 위한 임시 장치.
 *
 * **동작**:
 *   - `qp_mass_mail_recipients` 테이블에는 **원본 이메일 그대로 INSERT** (수집 결과 검증용 보존)
 *   - `sendMail` 호출 시점의 SMTP `to:` 만 redirect 매핑된 N개 이메일로 치환
 *   - GENERAL 매핑이 4개면 GENERAL recipient 1명당 SMTP 4건 발송
 *   - 매핑 없는 authRole 은 원본 이메일로 발송 (안전 폴백)
 *
 * **운영 사고 방지**:
 *   - `APP_ENV=production` 에서는 env 가 설정되어 있어도 무시 + 경고 로그
 *   - env 미설정 시 자동 원복 (코드 변경 없이 운영 진입 가능)
 *
 * **환경변수 형식 (JSON)**:
 * ```
 * MASS_MAIL_TEST_REDIRECT_MAP={"SUPER_ADMIN":["a@x"],"ADMIN":["b@x"],"FIRST_STORE":["c@x"],"SECOND_STORE":["d@x"],"GENERAL":["a@x","b@x","c@x","d@x"]}
 * ```
 */

import type { RecipientAuthRole } from "@/generated/prisma/client";

const LOG_TAG = "[mass-mail/test-redirect]";

type RedirectMap = Partial<Record<RecipientAuthRole, string[]>>;

/**
 * env JSON 파싱 시 허용되는 키 — `RecipientAuthRole` 와 1:1 매핑.
 *
 * SEKO 는 `collect-recipients` 가 `SekoNotSupportedError` 로 발송 자체를 차단하므로
 * 실제 redirect 분배 대상에서는 영구 제외. 다만 운영자가 env 에 SEKO 키를 실수로
 * 넣어도 알 수 없는 키 경고만 띄우고 통과시키도록 허용 키 집합에는 유지.
 */
const VALID_ROLES: ReadonlySet<RecipientAuthRole> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "FIRST_STORE",
  "SECOND_STORE",
  "SEKO",
  "GENERAL",
]);

/**
 * 매핑이 반드시 존재해야 하는 role 목록. SEKO 는 제외(미지원).
 *
 * `assertRedirectConfiguredForNonProd` 가 이 목록 전부의 매핑 존재 여부를 검증해
 * "GENERAL 만 누락" 같은 부분 매핑으로 GENERAL 회원 전원이 원본 이메일로 발송되는
 * fail-open 갭(코드리뷰 CRITICAL #1)을 차단.
 */
const REQUIRED_ROLES: readonly RecipientAuthRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "FIRST_STORE",
  "SECOND_STORE",
  "GENERAL",
] as const;

/**
 * env 를 1회 파싱해 캐시. 모듈 import 시점에 결정.
 * - production 에서는 항상 null (env 무시 + warning)
 * - env 미설정/파싱실패/형식오류 시 null (원본 발송)
 */
function loadRedirectMap(): RedirectMap | null {
  const raw = process.env.MASS_MAIL_TEST_REDIRECT_MAP?.trim();
  if (!raw) return null;

  // 운영 사고 방지 — production 배포에서는 절대 활성화 금지
  if (process.env.APP_ENV === "production") {
    console.warn(
      `${LOG_TAG} ⚠ APP_ENV=production 에서 MASS_MAIL_TEST_REDIRECT_MAP 감지 — 무시합니다. 운영 환경에서는 redirect 가 활성화되지 않습니다.`,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    console.warn(`${LOG_TAG} JSON 파싱 실패 — redirect 비활성. error:`, error);
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.warn(`${LOG_TAG} 형식 오류 — 객체가 아님. redirect 비활성.`);
    return null;
  }

  const map: RedirectMap = {};
  for (const [role, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!VALID_ROLES.has(role as RecipientAuthRole)) {
      console.warn(`${LOG_TAG} 알 수 없는 authRole 키 무시: ${role}`);
      continue;
    }
    if (!Array.isArray(value)) {
      console.warn(`${LOG_TAG} ${role} 값이 배열이 아님 — 해당 키 무시`);
      continue;
    }
    const emails = value
      .filter((v): v is string => typeof v === "string" && v.includes("@") && v.trim().length > 0)
      .map((v) => v.trim());
    if (emails.length === 0) {
      console.warn(`${LOG_TAG} ${role} 유효한 이메일 0건 — 해당 키 무시`);
      continue;
    }
    map[role as RecipientAuthRole] = emails;
  }

  if (Object.keys(map).length === 0) {
    console.warn(`${LOG_TAG} 유효한 매핑 0건 — redirect 비활성.`);
    return null;
  }

  console.warn(
    `${LOG_TAG} ⚠ 테스트 redirect 활성화 (APP_ENV=${process.env.APP_ENV ?? "unset"}). 매핑: ${Object.entries(
      map,
    )
      .map(([r, emails]) => `${r}=${emails.length}건`)
      .join(", ")}`,
  );
  return map;
}

/** 모듈 로드 시 1회 평가 — 런타임 중 env 변경은 반영되지 않음 (서버 재기동 필요) */
const REDIRECT_MAP = loadRedirectMap();

/**
 * authRole 에 매핑된 redirect 이메일 목록 반환.
 * - null 반환 시: redirect 비활성 또는 해당 role 매핑 없음 → 호출부는 원본 이메일로 발송
 * - 배열 반환 시: 해당 N개 이메일 각각으로 SMTP 발송 (원본 1건 → SMTP N건)
 */
export function getRedirectEmails(authRole: RecipientAuthRole): string[] | null {
  if (!REDIRECT_MAP) return null;
  return REDIRECT_MAP[authRole] ?? null;
}

/** redirect 활성 여부 — 로깅/디버깅용 */
export function isRedirectActive(): boolean {
  return REDIRECT_MAP !== null;
}

/**
 * dev/non-production 환경에서 redirect 매핑이 설정되지 않은 채 발송하려 하면 throw.
 *
 * **사고 방지 fail-safe** — APP_ENV=production 외 모든 환경에서 redirect 매핑 누락 시
 * 실 회원에게 메일이 가버리는 사고를 차단. 발송 트리거(processMassMailSend / processMassMailRetry)
 * 진입 시 호출하여 collect 단계 이전에 발송 자체를 거부 → status=send_failed.
 *
 * - APP_ENV=production : 운영 배포는 redirect 무시가 정상이므로 통과 (no-op)
 * - APP_ENV=development / 미설정 + REDIRECT_MAP 있음 + 모든 필수 role 매핑 존재 : 통과
 * - APP_ENV=development / 미설정 + REDIRECT_MAP 없음 : throw (실 회원 발송 차단)
 * - APP_ENV=development / 미설정 + REDIRECT_MAP 있음 + 일부 role 매핑 누락 : throw
 *   (부분 매핑 시 누락 role 회원이 원본 이메일로 fan-out 되는 fail-open 갭 차단)
 *
 * **dev 서버 배포 운영 절차**: Jenkins Credentials 의 dev env 파일에
 * MASS_MAIL_TEST_REDIRECT_MAP 추가 등록 필수 (인프라 담당). 등록 전까지는 dev 서버에서
 * 모든 mass_mail 발송이 send_failed 로 차단됨 — 의도된 동작.
 */
export function assertRedirectConfiguredForNonProd(): void {
  if (process.env.APP_ENV === "production") return;
  if (REDIRECT_MAP === null) {
    throw new Error(
      `[test-redirect] REDIRECT_NOT_CONFIGURED — APP_ENV=${process.env.APP_ENV ?? "unset"} 환경에서 ` +
      `MASS_MAIL_TEST_REDIRECT_MAP 미설정. 실 회원 발송 사고 방지를 위해 발송을 거부합니다. ` +
      `dev/local 환경은 매핑을 반드시 설정해야 합니다 (인프라 담당자에게 Jenkins Credentials 등록 의뢰 필요).`,
    );
  }

  // 부분 매핑 차단 — REQUIRED_ROLES 중 하나라도 매핑이 없으면 발송 거부.
  // 예: { "SUPER_ADMIN": [...] } 만 등록 → GENERAL recipient 이 원본 이메일로 발송되는 갭 차단.
  const missing = REQUIRED_ROLES.filter((role) => {
    const emails = REDIRECT_MAP[role];
    return !emails || emails.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(
      `[test-redirect] REDIRECT_PARTIAL_MAPPING — APP_ENV=${process.env.APP_ENV ?? "unset"} 환경에서 ` +
      `MASS_MAIL_TEST_REDIRECT_MAP 의 매핑이 누락된 role: [${missing.join(", ")}]. ` +
      `누락된 role 의 회원이 원본 이메일로 발송되는 사고를 막기 위해 발송을 거부합니다. ` +
      `필수 role(${REQUIRED_ROLES.join(", ")}) 모두에 테스트 이메일을 등록하세요.`,
    );
  }
}
