/**
 * 파일 경로 안전성 검증 유틸
 *
 * `startsWith(root)`만 사용하면 prefix bug 발생 가능
 * (`.../uploads-evil/x.pdf`가 `.../uploads`로 시작하여 우회).
 * 본 모듈은 `path.relative` 결과로 `..` 또는 절대경로가 나오지 않는지 검증.
 */

import { relative, sep, isAbsolute } from "path";

/**
 * 절대경로 `absolutePath`가 `dirAbsolute` 디렉토리(자신 또는 하위)에 속하는지 검증.
 *
 * @param absolutePath 검증 대상 절대경로 (반드시 `path.resolve`로 정규화 후 전달)
 * @param dirAbsolute  허용 디렉토리 절대경로 (반드시 정규화)
 * @returns 디렉토리 내부면 true, 외부면 false
 */
export function isInsideDir(absolutePath: string, dirAbsolute: string): boolean {
  if (absolutePath === dirAbsolute) return true;
  const rel = relative(dirAbsolute, absolutePath);
  if (rel.length === 0) return true;
  if (isAbsolute(rel)) return false;
  if (rel === "..") return false;
  if (rel.startsWith(`..${sep}`)) return false;
  return true;
}
