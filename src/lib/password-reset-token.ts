import crypto from "node:crypto";

/**
 * 비밀번호 초기화 토큰 해싱 유틸.
 *
 * 이메일/URL에는 원본 토큰(원시 UUID)을 전달하되, DB에는 SHA-256 해시만 저장한다.
 * DB 침해 시(SQL injection, 백업 유출 등) 해시만 노출되어 즉시 사용 가능한
 * 유효 토큰이 되지 않도록 한다.
 *
 * 조회 시에도 동일하게 입력 토큰을 해싱하여 DB의 해시 컬럼과 매칭한다.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** 새 원본 토큰(UUID) 생성 — 이메일/URL 전송용. DB에는 hashResetToken 결과를 저장한다. */
export function generateRawResetToken(): string {
  return crypto.randomUUID();
}
