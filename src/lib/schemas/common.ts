import { z } from "zod";

/** QSP 사용자 유형 (ADMIN, STORE, SEKO, GENERAL) */
export const userTpValues = ["ADMIN", "STORE", "SEKO", "GENERAL"] as const;

export const userTpSchema = z.enum(userTpValues);

/** 세부 권한코드 — 프론트에서 authRole로 접근 제어 */
export const authRoleValues = [
  "SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL",
] as const;

export const authRoleSchema = z.enum(authRoleValues);

/** 콘텐츠 게시대상 유형 */
export const targetTypeValues = [
  "first_store", "second_store", "seko", "general", "non_member",
] as const;

export const targetTypeSchema = z.enum(targetTypeValues);

/** URL path parameter ID 검증 — 공통 */
export const idParamSchema = z.coerce
  .number()
  .int("IDは整数である必要があります")
  .positive("IDは正の数である必要があります");

/** 신규/수정 여부 판단 기준 (5일) */
export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
