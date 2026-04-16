/**
 * 대량메일 POST/PUT 공통 유틸
 *
 * DOMPurify 설정, 첨부파일 타입, 클린업 함수를 공유하여
 * POST(route.ts)와 PUT([id]/route.ts) 간 중복을 제거한다.
 */

import { unlink, rm } from "fs/promises";
import { relative } from "path";

import { UPLOAD_DIR } from "@/lib/config";

// ─── DOMPurify 공통 설정 (stored XSS 방어) ───

export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "img", "span", "div", "hr",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "rel"],
  ALLOWED_URI_REGEXP: /^https:\/\//i,
  ALLOW_DATA_ATTR: false,
};

// ─── 첨부파일 공통 타입 ───

export interface PersistedAttachment {
  absolutePath: string;
  file: File;
  filePath: string;
}

// ─── 첨부파일 클린업 (에러 시 디스크 롤백) ───

export async function cleanupAttachments(
  files: PersistedAttachment[],
  logTag: string,
  dir?: string,
): Promise<void> {
  for (const w of files) {
    await unlink(w.absolutePath).catch((e: unknown) => {
      console.error(`[${logTag}] 첨부파일 정리 실패:`, relative(UPLOAD_DIR, w.absolutePath), e);
    });
  }
  if (dir) {
    await rm(dir, { recursive: true, force: true }).catch((e: unknown) => {
      console.error(`[${logTag}] 디렉토리 정리 실패:`, relative(UPLOAD_DIR, dir), e);
    });
  }
}
