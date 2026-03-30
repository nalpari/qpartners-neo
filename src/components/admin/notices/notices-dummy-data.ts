export interface NoticeItem {
  id: string;
  target: string;
  content: string;
  period: string;
  status: string;
  createdAt: string;
  author: string;
  updatedAt: string;
  updater: string;
}

export interface NoticeFormData {
  targets: string[];
  startDate: string;
  endDate: string;
  content: string;
  url: string;
  author: string;
  authorId: string;
  createdAt: string;
  updater: string;
  updaterId: string;
  updatedAt: string;
}

/** NoticeItem → NoticeFormData 변환 (edit 모드용) */
export function toFormData(item: NoticeItem): NoticeFormData {
  const [startDate = "", endDate = ""] = item.period.split(" ~ ");
  return {
    targets: [item.target],
    startDate,
    endDate,
    content: item.content,
    url: "",
    author: item.author,
    authorId: "admin001",
    createdAt: item.createdAt,
    updater: item.updater,
    updaterId: "admin001",
    updatedAt: item.updatedAt,
  };
}

export const EMPTY_NOTICE_FORM: NoticeFormData = {
  targets: [],
  startDate: "",
  endDate: "",
  content: "",
  url: "",
  author: "金志映",
  authorId: "admin001",
  createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  updater: "",
  updaterId: "",
  updatedAt: "",
};

export const DUMMY_NOTICES: NoticeItem[] = [
  { id: "N001", target: "全会員", content: "システムメンテナンスのお知らせ（4月実施）", period: "2026.04.01 ~ 2026.04.30", status: "掲示予定", createdAt: "2026.03.25", author: "田中 太郎", updatedAt: "2026.03.25", updater: "田中 太郎" },
  { id: "N002", target: "管理者", content: "管理者向け新機能リリースのご案内", period: "2026.03.20 ~ 2026.04.20", status: "掲示中", createdAt: "2026.03.20", author: "佐藤 花子", updatedAt: "2026.03.22", updater: "佐藤 花子" },
  { id: "N003", target: "1次店", content: "1次販売店向け価格改定のお知らせ", period: "2026.03.15 ~ 2026.03.31", status: "掲示中", createdAt: "2026.03.15", author: "鈴木 一郎", updatedAt: "2026.03.15", updater: "鈴木 一郎" },
  { id: "N004", target: "施工店", content: "施工マニュアル改訂版のご案内", period: "2026.03.10 ~ 2026.04.10", status: "掲示中", createdAt: "2026.03.10", author: "高橋 美咲", updatedAt: "2026.03.12", updater: "田中 太郎" },
  { id: "N005", target: "全会員", content: "年末年始の営業日程について", period: "2025.12.15 ~ 2026.01.10", status: "終了", createdAt: "2025.12.10", author: "田中 太郎", updatedAt: "2025.12.10", updater: "田中 太郎" },
  { id: "N006", target: "2次店以下", content: "2次販売店向けキャンペーン開始のお知らせ", period: "2026.03.01 ~ 2026.03.31", status: "掲示中", createdAt: "2026.02.28", author: "佐藤 花子", updatedAt: "2026.03.01", updater: "佐藤 花子" },
  { id: "N007", target: "一般会員", content: "一般会員向けポイントプログラム変更のご案内", period: "2026.04.01 ~ 2026.04.30", status: "掲示予定", createdAt: "2026.03.24", author: "鈴木 一郎", updatedAt: "2026.03.24", updater: "鈴木 一郎" },
  { id: "N008", target: "スーパー管理者", content: "システム権限変更に関する重要なお知らせ", period: "2026.03.20 ~ 2026.04.20", status: "掲示中", createdAt: "2026.03.18", author: "高橋 美咲", updatedAt: "2026.03.20", updater: "高橋 美咲" },
  { id: "N009", target: "全会員", content: "サービス利用規約改定のお知らせ", period: "2026.02.01 ~ 2026.02.28", status: "終了", createdAt: "2026.01.25", author: "田中 太郎", updatedAt: "2026.01.28", updater: "佐藤 花子" },
  { id: "N010", target: "管理者", content: "管理画面UI改善のお知らせ", period: "2026.03.25 ~ 2026.04.25", status: "掲示中", createdAt: "2026.03.23", author: "佐藤 花子", updatedAt: "2026.03.25", updater: "佐藤 花子" },
  { id: "N011", target: "1次店", content: "新製品カタログ掲載開始のご案内", period: "2026.04.10 ~ 2026.05.10", status: "掲示予定", createdAt: "2026.03.22", author: "鈴木 一郎", updatedAt: "2026.03.22", updater: "鈴木 一郎" },
  { id: "N012", target: "施工店", content: "安全講習会開催のお知らせ", period: "2026.03.05 ~ 2026.03.20", status: "終了", createdAt: "2026.03.01", author: "高橋 美咲", updatedAt: "2026.03.05", updater: "高橋 美咲" },
  { id: "N013", target: "全会員", content: "GW期間中のサポート対応について", period: "2026.04.20 ~ 2026.05.10", status: "掲示予定", createdAt: "2026.03.20", author: "田中 太郎", updatedAt: "2026.03.20", updater: "田中 太郎" },
  { id: "N014", target: "2次店以下", content: "在庫管理システム更新のお知らせ", period: "2026.03.15 ~ 2026.04.15", status: "掲示中", createdAt: "2026.03.13", author: "佐藤 花子", updatedAt: "2026.03.15", updater: "佐藤 花子" },
  { id: "N015", target: "一般会員", content: "会員情報更新のお願い", period: "2026.03.01 ~ 2026.03.15", status: "終了", createdAt: "2026.02.25", author: "鈴木 一郎", updatedAt: "2026.02.28", updater: "田中 太郎" },
];
