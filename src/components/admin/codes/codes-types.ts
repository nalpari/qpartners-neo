// Design Ref: §2 — 코드관리 공용 타입 (H5 의존 역전 해소)

// API Response Types
export interface CodeHeaderResponse {
  id: number;
  headerCode: string;
  headerAlias: string;
  headerName: string;
  relCode1: string | null;
  relCode2: string | null;
  relCode3: string | null;
  relNum1: string | null;
  relNum2: string | null;
  relNum3: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CodeDetailResponse {
  id: number;
  headerId: number;
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  relCode1: string | null;
  relCode2: string | null;
  relCode3: string | null;
  relNum1: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  relNum1: string;
  sortOrder: number;
  isActive: "Y" | "N";
  isNew?: boolean;
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
    relNum1: row.relNum1 ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive ? "Y" : "N",
  };
}

// nullable 필드 상수 (Craftsman)
export const DETAIL_NULLABLE_FIELDS = ["relCode1", "relCode2", "relNum1", "codeNameEtc"] as const;

export const EMPTY_HEADER_FIELDS = { headerCode: "", headerAlias: "", headerName: "", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "" };
export const EMPTY_DETAIL_FIELDS = { code: "", displayCode: "", codeName: "", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: "" };
