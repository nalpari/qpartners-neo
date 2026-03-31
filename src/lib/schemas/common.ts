import { z } from "zod";

/** QSP 사용자 유형 (ADMIN, DEALER, SEKO, GENERAL) */
export const userTpValues = ["ADMIN", "DEALER", "SEKO", "GENERAL"] as const;

export const userTpSchema = z.enum(userTpValues);
