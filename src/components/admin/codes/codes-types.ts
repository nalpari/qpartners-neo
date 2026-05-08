// 코드관리 화면 공용 타입 — 서버 Zod 스키마(src/lib/schemas/code.ts)의 z.infer를 단일 소스로 재수출하고
// 그리드 전용 파생 타입(HeaderGridRow/DetailGridRow)과 API → Grid 변환 함수를 정의
import type { CodeHeaderResponse, CodeDetailResponse } from "@/lib/schemas/code";
export type { CodeHeaderResponse, CodeDetailResponse };

// Grid ViewModel Types
export interface HeaderGridRow {
  id: string;
  headerCode: string;
  headerAlias: string;
  headerName: string;
  relCode1: string;
  relCode2: string;
  relCode3: string;
  relNum1: string;
  relNum2: string;
  relNum3: string;
  isActive: "Y" | "N";
  isNew?: boolean;
  /** 인라인 편집 중인 필드명 — 부모에서 editingCell 정보를 row 에 주입 */
  editingField?: string;
}

export interface DetailGridRow {
  id: string;
  headerId: string;
  headerCode: string;
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string;
  relCode1: string;
  relCode2: string;
  relCode3: string;
  sortOrder: number;
  isActive: "Y" | "N";
  isNew?: boolean;
  /** 인라인 편집 중인 필드명 — 부모에서 editingCell 정보를 row 에 주입 */
  editingField?: string;
}

// API → Grid 변환
export function toHeaderGridRow(row: CodeHeaderResponse): HeaderGridRow {
  return {
    id: String(row.id),
    headerCode: row.headerCode,
    headerAlias: row.headerAlias,
    headerName: row.headerName,
    relCode1: row.relCode1 ?? "",
    relCode2: row.relCode2 ?? "",
    relCode3: row.relCode3 ?? "",
    relNum1: row.relNum1 ?? "",
    relNum2: row.relNum2 ?? "",
    relNum3: row.relNum3 ?? "",
    isActive: row.isActive ? "Y" : "N",
  };
}

export function toDetailGridRow(row: CodeDetailResponse, headerCode: string): DetailGridRow {
  return {
    id: String(row.id),
    headerId: String(row.headerId),
    headerCode,
    code: row.code,
    displayCode: row.displayCode,
    codeName: row.codeName,
    codeNameEtc: row.codeNameEtc ?? "",
    relCode1: row.relCode1 ?? "",
    relCode2: row.relCode2 ?? "",
    relCode3: row.relCode3 ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive ? "Y" : "N",
  };
}

// nullable 필드 상수 (Craftsman)
export const DETAIL_NULLABLE_FIELDS = ["relCode1", "relCode2", "relCode3", "codeNameEtc"] as const;
export const HEADER_NULLABLE_FIELDS = ["relCode1", "relCode2", "relCode3", "relNum1", "relNum2", "relNum3"] as const;
export const HEADER_NUMERIC_FIELDS = ["relNum1", "relNum2", "relNum3"] as const;
export const DETAIL_NUMERIC_FIELDS = ["sortOrder"] as const;

export const EMPTY_HEADER_FIELDS = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
export const EMPTY_DETAIL_FIELDS = { code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relCode3: "", sortOrder: "" };
