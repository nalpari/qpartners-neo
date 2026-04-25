/**
 * 자동로그인 AES-256 암복호화 유틸리티
 *
 * 가이드 사양:
 *   plainUserId -> AES256 암호화(키: YYYYMMDD + AUTO_LOGIN_AES_KEY) -> cipherText
 *   encodeURIComponent(cipherText) -> URL_ENCODED_CIPHERTEXT
 *
 * 구현 세부:
 *   - AES-256-CBC, PKCS5Padding(Node 기본)
 *   - 키: SHA-256(YYYYMMDD_KST + AUTO_LOGIN_AES_KEY) → 32바이트
 *   - IV : 요청마다 crypto.randomBytes(16)로 새로 생성 (결정적 IV 방지)
 *   - 출력 포맷: Base64(IV || ciphertext) — 16바이트 IV를 cipher 앞에 prepend
 *
 * 자정 경계: 복호화 실패 시 전일 키로 재시도하여 KST 00:00 전후 오차를 흡수한다.
 *
 * 보안 배경: 이전 구현은 IV를 SHA-256(key) 앞 16바이트로 파생하여 (key, IV)가 하루 고정이었음.
 * 동일 userId → 동일 cipher가 되어 Codebook Attack / Replay / Correlation에 취약.
 * 랜덤 IV로 IND-CPA 안전성(NIST SP 800-38A) 요구사항을 충족한다.
 */

import crypto from "node:crypto";

import { ConfigError } from "@/lib/errors";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/**
 * AUTO_LOGIN_AES_KEY 최소 길이 — SHA-256 파생이라 길이 자체가 엔트로피 하한은 아니지만
 * 운영 사고(빈 값·오타) 방지용 가드.
 *
 * QSP 와 합의된 현행 시크릿은 8자(예: `_autoL!!`) 고정이라 임의로 키 길이를 늘릴 수 없음 —
 * 메모리 `project_auto_login_flow.md` 참조. 따라서 하한을 8로 설정해 가드를 유지하되
 * 현행 키를 배제하지 않도록 한다.
 */
const MIN_AES_SECRET_LENGTH = 8;

/** KST(UTC+9) 기준 YYYYMMDD */
function formatKstDate(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getTodayKST(): string {
  return formatKstDate(new Date());
}

function getYesterdayKST(): string {
  return formatKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function deriveKey(keyString: string): Buffer {
  return crypto.createHash("sha256").update(keyString, "utf8").digest();
}

function getAesSecret(): string {
  const envKey = process.env.AUTO_LOGIN_AES_KEY;
  if (!envKey) {
    throw new ConfigError("AUTO_LOGIN_AES_KEY 환경변수가 설정되지 않았습니다");
  }
  const trimmed = envKey.trim();
  if (trimmed.length === 0) {
    throw new ConfigError("AUTO_LOGIN_AES_KEY 환경변수가 공백 문자로만 구성되어 있습니다");
  }
  if (trimmed.length < MIN_AES_SECRET_LENGTH) {
    throw new ConfigError(
      `AUTO_LOGIN_AES_KEY 길이가 최소 기준(${MIN_AES_SECRET_LENGTH}자) 미만입니다`,
    );
  }
  // 반드시 trimmed 반환 — env 값에 우연히 공백/개행이 섞이면 외부 3사와 SHA-256 결과가 달라져
  // 간헐적 복호화 실패가 발생한다. 유효성 검사에 사용한 값으로 일관되게 내보낸다.
  return trimmed;
}

function decryptWithKey(payload: Buffer, keyString: string): string {
  if (payload.length <= IV_LENGTH) {
    throw new Error("cipher payload 길이가 IV 길이보다 짧음");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH);
  const key = deriveKey(keyString);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** AES-256-CBC 복호화 — 자정 경계 대응: 당일 키 실패 시 전일 키로 재시도 */
export function decryptAutoLogin(cipherText: string): string {
  const secret = getAesSecret();
  const payload = Buffer.from(cipherText, "base64");
  try {
    return decryptWithKey(payload, getTodayKST() + secret);
  } catch (todayError: unknown) {
    // 자정 직후(KST) 전일 키로 암호화된 cipher 유입은 정상 경로지만, cipher 포맷 오류·
    // 키 교체 실수·패딩 오라클 프로빙 등 실제 장애도 같은 분기로 흐름. 프로덕션에서도 컨텍스트 유지.
    console.warn("[auto-login-crypto] 당일 키 복호화 실패 — 전일 키로 재시도:", {
      errorName: todayError instanceof Error ? todayError.name : typeof todayError,
      errorMessage: todayError instanceof Error ? todayError.message : String(todayError),
    });
    try {
      return decryptWithKey(payload, getYesterdayKST() + secret);
    } catch (yesterdayError: unknown) {
      // 당일·전일 키 모두 실패 — 두 에러 모두 기록해 원인 추적 가능하게 유지
      console.error("[auto-login-crypto] 당일·전일 키 모두 복호화 실패:", {
        todayErrorName: todayError instanceof Error ? todayError.name : typeof todayError,
        todayErrorMessage: todayError instanceof Error ? todayError.message : String(todayError),
        yesterdayErrorName: yesterdayError instanceof Error ? yesterdayError.name : typeof yesterdayError,
        yesterdayErrorMessage: yesterdayError instanceof Error ? yesterdayError.message : String(yesterdayError),
      });
      throw yesterdayError;
    }
  }
}
