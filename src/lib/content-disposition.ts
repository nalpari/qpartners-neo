/**
 * `Content-Disposition` 헤더 파일명 추출 유틸 — 클라이언트 다운로드 공통.
 *
 * blob URL 다운로드(`a.download`) 시 헤더가 무시되어 마지막 path segment(UUID) 가 파일명으로
 * 사용되는 현상을 막기 위해, 응답 헤더에서 명시적으로 파일명을 파싱하여 `a.download` 에 세팅한다.
 *
 * RFC 5987 `filename*=UTF-8''<percent-encoded>` 우선 처리 (일본어/한국어 보존),
 * 미존재 시 `filename="..."` fallback.
 */
export function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch (decodeError) {
      // percent-encoding 깨진 경우 fallback (filename=) 으로 진행
      console.warn(
        "[content-disposition] filename* 디코딩 실패:",
        decodeError,
      );
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}
