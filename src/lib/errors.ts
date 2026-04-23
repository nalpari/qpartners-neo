/**
 * 공용 에러 타입
 *
 * ConfigError — 환경변수 누락 등 런타임 설정 문제.
 * 문자열 매칭 대신 `instanceof ConfigError` 로 분기해야 하며,
 * 각 모듈에서 로컬 재정의 금지 (별개 클래스가 되어 instanceof 실패).
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
