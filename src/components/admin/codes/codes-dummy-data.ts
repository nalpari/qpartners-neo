export interface CodeHeaderItem {
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
  isSaved?: boolean;
}

export interface CodeDetailItem {
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
  isSaved?: boolean;
}

export const DUMMY_HEADERS: CodeHeaderItem[] = [
  { id: "1", headerCode: "MEMBER_TYPE", headerAlias: "MBR_TYPE", headerName: "会員タイプ", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "", isActive: "Y" },
  { id: "2", headerCode: "COMPANY_TYPE", headerAlias: "CMP_TYPE", headerName: "会社区分", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "", isActive: "Y" },
  { id: "3", headerCode: "STATUS", headerAlias: "STATUS", headerName: "ステータス", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "", isActive: "Y" },
  { id: "4", headerCode: "CATEGORY", headerAlias: "CATEG", headerName: "カテゴリー", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "", isActive: "Y" },
  { id: "5", headerCode: "REGION", headerAlias: "REGION", headerName: "地域区分", relCode1: "", relCode2: "", relCode3: "", relNum1: "", relNum2: "", relNum3: "", isActive: "N" },
];

export const DUMMY_DETAILS: CodeDetailItem[] = [
  // MEMBER_TYPE
  { id: "101", headerId: "1", headerCode: "MEMBER_TYPE", code: "STORE", displayCode: "01", codeName: "販売店会員", codeNameEtc: "BtoB", relCode1: "", relCode2: "", relNum1: "", sortOrder: 1, isActive: "Y" },
  { id: "102", headerId: "1", headerCode: "MEMBER_TYPE", code: "INSTALLER", displayCode: "02", codeName: "施工店会員", codeNameEtc: "BtoB", relCode1: "", relCode2: "", relNum1: "", sortOrder: 2, isActive: "Y" },
  { id: "103", headerId: "1", headerCode: "MEMBER_TYPE", code: "GENERAL", displayCode: "03", codeName: "一般会員", codeNameEtc: "BtoC", relCode1: "", relCode2: "", relNum1: "", sortOrder: 3, isActive: "Y" },

  // COMPANY_TYPE
  { id: "201", headerId: "2", headerCode: "COMPANY_TYPE", code: "CORP", displayCode: "01", codeName: "法人", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: 1, isActive: "Y" },
  { id: "202", headerId: "2", headerCode: "COMPANY_TYPE", code: "SOLE", displayCode: "02", codeName: "個人事業主", codeNameEtc: "", relCode1: "", relCode2: "", relNum1: "", sortOrder: 2, isActive: "Y" },

  // STATUS
  { id: "301", headerId: "3", headerCode: "STATUS", code: "ACT", displayCode: "ACT", codeName: "アクティブ", codeNameEtc: "Active", relCode1: "", relCode2: "", relNum1: "", sortOrder: 1, isActive: "Y" },
  { id: "302", headerId: "3", headerCode: "STATUS", code: "INA", displayCode: "INA", codeName: "非アクティブ", codeNameEtc: "Inactive", relCode1: "", relCode2: "", relNum1: "", sortOrder: 2, isActive: "Y" },
  { id: "303", headerId: "3", headerCode: "STATUS", code: "PND", displayCode: "PND", codeName: "保留中", codeNameEtc: "Pending", relCode1: "", relCode2: "", relNum1: "", sortOrder: 3, isActive: "Y" },

  // CATEGORY
  { id: "401", headerId: "4", headerCode: "CATEGORY", code: "SOLAR", displayCode: "01", codeName: "太陽光", codeNameEtc: "Solar", relCode1: "", relCode2: "", relNum1: "", sortOrder: 1, isActive: "Y" },
  { id: "402", headerId: "4", headerCode: "CATEGORY", code: "BATTERY", displayCode: "02", codeName: "蓄電池", codeNameEtc: "Battery", relCode1: "", relCode2: "", relNum1: "", sortOrder: 2, isActive: "Y" },
  { id: "403", headerId: "4", headerCode: "CATEGORY", code: "EV", displayCode: "03", codeName: "EV充電器", codeNameEtc: "EV Charger", relCode1: "", relCode2: "", relNum1: "", sortOrder: 3, isActive: "N" },

  // REGION
  { id: "501", headerId: "5", headerCode: "REGION", code: "KANTO", displayCode: "01", codeName: "関東", codeNameEtc: "Kanto", relCode1: "", relCode2: "", relNum1: "", sortOrder: 1, isActive: "Y" },
  { id: "502", headerId: "5", headerCode: "REGION", code: "KANSAI", displayCode: "02", codeName: "関西", codeNameEtc: "Kansai", relCode1: "", relCode2: "", relNum1: "", sortOrder: 2, isActive: "Y" },
];
