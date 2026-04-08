/**
 * 파일 경로 안전성 검증 유틸
 *
 * `startsWith(root)`만 사용하면 prefix bug 발생 가능
 * (`.../uploads-evil/x.pdf`가 `.../uploads`로 시작하여 우회).
 * 본 모듈은 `path.relative` 결과로 `..` 또는 절대경로가 나오지 않는지 검증.
 */

import { relative, sep, isAbsolute } from "path";
import { lstat } from "fs/promises";

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

/**
 * 심볼릭 링크 여부를 `lstat`로 검증하여 정규 파일인지 확인.
 *
 * `isInsideDir()`는 lexical-only 검증이라 symlink를 해석하지 않는다.
 * storage 내에 공격자가 심어둔 symlink가 존재할 경우 임의 파일 읽기/삭제로 이어질 수 있으므로
 * FS 작업 직전에 `lstat` 기반으로 심볼릭 링크·특수 파일을 거부해 방어 심층(defense-in-depth)을 구현.
 *
 * @param absolutePath 검증 대상 절대경로 (isInsideDir 통과 후 전달)
 * @returns symlink/특수 파일이 아닌 정규 파일이면 true, 그 외(존재하지 않거나 에러 포함)는 false
 */
export async function isRegularFile(absolutePath: string): Promise<boolean> {
  try {
    const info = await lstat(absolutePath);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}
