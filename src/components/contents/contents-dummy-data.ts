// 더미 테이블 데이터 (기획서 image01.png 기준)

export interface ContentItem {
  id: string;
  infoType: string;
  target: string;
  title: string;
  hasAttachment: boolean;
  createdAt: string;
  updatedAt: string | null;
  postTarget: string;
  department: string;
  approver: string;
}

export const DUMMY_CONTENTS: ContentItem[] = [
  {
    id: "1",
    infoType: "記事, FAQ",
    target: "BtoB, BtoC",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.03.18",
    updatedAt: "2026.03.18",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "2",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.03.17",
    updatedAt: "2026.03.19",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "3",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "4",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "5",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "6",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "7",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
];

// 상세 페이지용 인터페이스
export interface ContentDetailItem {
  id: string;
  department: string;
  publisher: string;
  updater: string;
  approver: string;
  postTargets: {
    label: string;
    active: boolean;
    period: string;
  }[];
  categories: {
    label: string;
    values: string;
    internalValues?: string;
  }[];
  title: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  viewCount: number;
  attachments: {
    name: string;
    type: "image" | "pdf" | "file";
  }[];
}

export const DUMMY_DETAIL: ContentDetailItem = {
  id: "1",
  department: "品質保証",
  publisher: "金志映",
  updater: "金志志映",
  approver: "事業部長",
  postTargets: [
    { label: "一次点", active: true, period: "2026.03.20~2026.03.30" },
    { label: "2次点以下", active: true, period: "2026.03.20~2026.03.30" },
    { label: "施工店", active: true, period: "2026.03.20~2026.03.30" },
    { label: "一般会員", active: true, period: "2026.03.20~2026.03.30" },
    { label: "非会員", active: false, period: "-" },
  ],
  categories: [
    { label: "投稿対象", values: "記事, ファイル, FAQ" },
    { label: "業務分類", values: "営業・マーケティング, 累積", internalValues: "IT管理" },
    { label: "製品分類", values: "太陽電池モジュール, システム全体" },
    { label: "製品状態", values: "現行品" },
    { label: "用途", values: "住宅, 低圧, 高圧, 自己消費" },
    { label: "内容分類", values: "公知, 施工資料, 市場制度" },
    { label: "データ分類", values: "" },
    { label: "対象", values: "" },
  ],
  title: "お問い合わせ窓口受付時間拡大のお知らせ お問い合わせ窓口受付時間拡大お知らせ",
  createdAt: "2026.03.09",
  updatedAt: "2026.03.10",
  body: "1. お問い合わせ窓口 電話番号\n0120-322-001 (電話番号に変更はございません)\n\n2. 変更内容\n(変更前)\n受付時間 9:00～17:00 (12:00～13:00を除く)\n※土日・祝日, 年末年始および臨時休業日を除く\n\n(変更後)\n受付時間 9:00～18:00\n※年末年始および臨時休業日を除く\n※土日・祝日も一次受付を行います.\nただし, お問い合わせ内容によりましては, 回答が翌営業日以降となる場合がございます.\n\n3. 変更日\n2026年 4月 1日 (水) より",
  viewCount: 1000,
  attachments: [
    { name: "新製品発売開始.png", type: "image" },
    { name: "新製品発売開始.png", type: "image" },
    { name: "新製品発売開始.pdf", type: "pdf" },
    { name: "新製品発売開始.pdf", type: "pdf" },
    { name: "新製品発売開始.pdf", type: "pdf" },
    { name: "新製品発売開始.png", type: "image" },
    { name: "新製品発売開始.png", type: "image" },
  ],
};

// NEW: 등록일부터 5일간
export function isNew(createdAt: string): boolean {
  const date = new Date(createdAt.replace(/\./g, "-"));
  const diff = Date.now() - date.getTime();
  return diff <= 5 * 24 * 60 * 60 * 1000;
}

// UPDATE: 갱신일부터 5일간
export function isUpdated(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const date = new Date(updatedAt.replace(/\./g, "-"));
  const diff = Date.now() - date.getTime();
  return diff <= 5 * 24 * 60 * 60 * 1000;
}
