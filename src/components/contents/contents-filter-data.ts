// 검색조건 카테고리 필터 정적 데이터
// 기획서 image02.png 기준

export interface FilterCategory {
  key: string;
  label: string;
  items: FilterItem[];
}

export interface FilterItem {
  value: string;
  label: string;
  internalOnly?: boolean; // 사내 전용 (빨간색 표시)
}

export const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: "infoTypes",
    label: "情報タイプ",
    items: [
      { value: "article", label: "記事" },
      { value: "file", label: "ファイル" },
      { value: "video", label: "動画" },
      { value: "faq", label: "FAQ" },
    ],
  },
  {
    key: "bizCategories",
    label: "業務分類",
    items: [
      { value: "sales_marketing", label: "営業・マーケティング" },
      { value: "tech_design", label: "技術・設計" },
      { value: "cumulative", label: "累積" },
      { value: "construction", label: "施工" },
      { value: "maintenance", label: "保守・保証" },
      { value: "cs", label: "CS" },
      { value: "management_planning", label: "経営企画", internalOnly: true },
      { value: "it_admin", label: "IT管理", internalOnly: true },
    ],
  },
  {
    key: "productTypes",
    label: "製品分類",
    items: [
      { value: "solar_module", label: "太陽電池モジュール" },
      { value: "power_conditioner", label: "パワーコンディショナー" },
      { value: "junction_box", label: "接続箱・昇圧機" },
      { value: "cable", label: "ケーブル" },
      { value: "battery", label: "蓄電池" },
      { value: "v2h", label: "V2H" },
      { value: "mount", label: "架台" },
      { value: "monitoring", label: "監視システム" },
      { value: "hems", label: "HEMS" },
      { value: "full_system", label: "全体システム" },
    ],
  },
  {
    key: "productStatus",
    label: "製品状態",
    items: [
      { value: "current", label: "現行品" },
      { value: "discontinued", label: "販売終了品" },
    ],
  },
  {
    key: "usage",
    label: "用途",
    items: [
      { value: "residential", label: "住宅" },
      { value: "low_voltage", label: "低圧" },
      { value: "high_voltage", label: "高圧" },
      { value: "residential_ppa", label: "住宅用PPA" },
      { value: "self_consumption", label: "自家消費" },
      { value: "power_business", label: "電力事業" },
    ],
  },
  {
    key: "contentTypes",
    label: "内容分類",
    items: [
      { value: "notice", label: "お知らせ" },
      { value: "design_doc", label: "設計資料" },
      { value: "construction_doc", label: "施工資料" },
      { value: "issue", label: "問題" },
      { value: "maintenance_doc", label: "保守・保証" },
      { value: "market_system", label: "市場制度" },
      { value: "internal_work", label: "社内業務", internalOnly: true },
    ],
  },
  {
    key: "docTypes",
    label: "資料分類",
    items: [
      { value: "spec", label: "仕様書" },
      { value: "datasheet", label: "データシート" },
      { value: "manual", label: "取扱説明書(マニュアル)" },
      { value: "template", label: "テンプレート" },
      { value: "catalog", label: "カタログ" },
      { value: "printed", label: "その他印刷物" },
      { value: "contract_guide", label: "契約ガイドライン" },
    ],
  },
  {
    key: "targets",
    label: "対象",
    items: [
      { value: "btob", label: "BtoB" },
      { value: "btoc", label: "BtoC" },
    ],
  },
];

// 관리자용 담당부門 옵션
export const DEPARTMENT_OPTIONS = [
  { value: "", label: "担当部門" },
  { value: "sales", label: "営業" },
  { value: "marketing", label: "マーケティング" },
  { value: "tech", label: "技術" },
  { value: "construction", label: "施工" },
  { value: "cumulative", label: "累積" },
  { value: "quality", label: "品質保証" },
  { value: "cs", label: "CS" },
  { value: "ppa", label: "PPAサービス" },
  { value: "management", label: "経営企画" },
  { value: "planning", label: "企画管理" },
  { value: "it", label: "IT管理" },
];

// 관리자용 게시대상 옵션
export const POST_TARGET_OPTIONS = [
  { value: "", label: "掲示対象" },
  { value: "first_dealer", label: "1次販売店" },
  { value: "second_dealer", label: "2次以降の販売店" },
  { value: "installer", label: "施工店" },
  { value: "general", label: "一般" },
  { value: "non_member", label: "非会員" },
];
