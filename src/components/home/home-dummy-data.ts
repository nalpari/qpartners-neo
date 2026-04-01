// Design Ref: §1 — 더미 데이터 정의

export interface ContentItem {
  id: number;
  title: string;
  date: string;
  updatedDate: string;
  isNew: boolean;
  isUpdated: boolean;
  categories: {
    infoType: string;
    businessType: string;
    productType: string;
    productStatus: string;
    contentType: string;
  };
}

export interface DownloadItem {
  id: number;
  materialTitle: string;
  fileName: string;
  date: string;
}

export const DUMMY_CONTENTS: ContentItem[] = [
  {
    id: 1,
    title: "[住宅] 住友電気工業社ハイブリッド蓄電システムPDRx販売のご案内",
    date: "2026.01.26",
    updatedDate: "2026.03.10",
    isNew: true,
    isUpdated: true,
    categories: {
      infoType: "記事, ファイル, 動画",
      businessType: "営業マーケティング, 技術設計, 累積, 施工",
      productType: "太陽電池モジュール",
      productStatus: "現行品",
      contentType: "市場制度",
    },
  },
  {
    id: 2,
    title: "[住宅] 住友電気工業社ハイブリッド蓄電システムPDRx販売のご案内",
    date: "2026.01.26",
    updatedDate: "2026.03.10",
    isNew: true,
    isUpdated: true,
    categories: {
      infoType: "記事, ファイル, 動画",
      businessType: "営業マーケティング, 技術設計, 累積, 施工",
      productType: "太陽電池モジュール",
      productStatus: "現行品",
      contentType: "市場制度",
    },
  },
  {
    id: 3,
    title: "[住宅] 住友電気工業社ハイブリッド蓄電システムPDRx販売のご案内",
    date: "2026.01.26",
    updatedDate: "2026.03.10",
    isNew: true,
    isUpdated: true,
    categories: {
      infoType: "記事, ファイル, 動画",
      businessType: "営業マーケティング, 技術設計, 累積, 施工",
      productType: "太陽電池モジュール",
      productStatus: "現行品",
      contentType: "市場制度",
    },
  },
];

export const DUMMY_DOWNLOADS: DownloadItem[] = [
  { id: 1, materialTitle: "素材タイトル", fileName: "納入仕様書_Re.RiSE-NBC AG270.pdf", date: "2026.03.09" },
  { id: 2, materialTitle: "素材タイトル", fileName: "納入仕様書_Re.RiSE-NBC AG270.pdf", date: "2026.03.09" },
  { id: 3, materialTitle: "素材タイトル", fileName: "納入仕様書_Re.RiSE-NBC AG270.pdf", date: "2026.03.09" },
  { id: 4, materialTitle: "素材タイトル", fileName: "納入仕様書_Re.RiSE-NBC AG270.pdf", date: "2026.03.09" },
];
