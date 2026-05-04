import { z } from "zod";

/**
 * QSP 부서(担当部門) 단일 항목 — `/api/master/deptList` 응답 `data[]` 요소.
 * 사양서: deptCd VARCHAR(50) NOT NULL, deptNm VARCHAR(100) NOT NULL.
 */
export const qspDeptItemSchema = z.object({
  deptCd: z.string().max(50),
  deptNm: z.string().max(100),
});

export type QspDeptItem = z.infer<typeof qspDeptItemSchema>;

/**
 * QSP 부서 목록 응답 envelope.
 *
 * 표준 QSP 응답(`{ data, result }`) 형태. `data` 는 항목 없을 때 null 가능 (Response Example 기준).
 * `result.resultMsg` 는 사양서 Not Nullable=N — 성공 케이스에서 빈 문자열도 허용.
 */
export const qspDeptListResponseSchema = z.object({
  data: z.array(qspDeptItemSchema).nullable(),
  result: z.object({
    code: z.number().int(),
    message: z.string(),
    resultCode: z.string().max(1),
    resultMsg: z.string().nullable().optional(),
  }),
});
