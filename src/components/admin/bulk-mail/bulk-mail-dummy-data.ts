export interface BulkMailItem {
  id: string;
  sentAt: string;
  status: string;
  target: string;
  title: string;
  hasAttachment: boolean;
  authorName: string;
  authorId: string;
}

export const DUMMY_BULK_MAILS: BulkMailItem[] = [
  { id: "BM001", sentAt: "2026.03.25 10:00", status: "配信完了", target: "全会員", title: "【重要】システムメンテナンスのお知らせ", hasAttachment: true, authorName: "田中 太郎", authorId: "admin001" },
  { id: "BM002", sentAt: "2026.03.24 14:30", status: "配信完了", target: "BtoB", title: "新製品カタログ配信のご案内", hasAttachment: true, authorName: "佐藤 花子", authorId: "admin002" },
  { id: "BM003", sentAt: "2026.03.23 09:00", status: "配信完了", target: "BtoC", title: "春のキャンペーンのお知らせ", hasAttachment: false, authorName: "田中 太郎", authorId: "admin001" },
  { id: "BM004", sentAt: "2026.03.22 16:00", status: "配信待ち", target: "全会員", title: "4月定期メンテナンス日程のご案内", hasAttachment: false, authorName: "鈴木 一郎", authorId: "admin003" },
  { id: "BM005", sentAt: "", status: "下書き", target: "BtoB", title: "【下書き】新規パートナー募集のご案内", hasAttachment: true, authorName: "佐藤 花子", authorId: "admin002" },
  { id: "BM006", sentAt: "2026.03.20 11:00", status: "配信完了", target: "BtoB", title: "技術資料アップデートのお知らせ", hasAttachment: true, authorName: "高橋 美咲", authorId: "admin004" },
  { id: "BM007", sentAt: "2026.03.19 15:30", status: "配信完了", target: "全会員", title: "利用規約改定のお知らせ", hasAttachment: false, authorName: "田中 太郎", authorId: "admin001" },
  { id: "BM008", sentAt: "", status: "下書き", target: "BtoC", title: "【下書き】夏季休業のお知らせ", hasAttachment: false, authorName: "鈴木 一郎", authorId: "admin003" },
  { id: "BM009", sentAt: "2026.03.17 10:00", status: "配信完了", target: "BtoB", title: "Q.PARTNERS アップデート v2.5 リリースノート", hasAttachment: true, authorName: "佐藤 花子", authorId: "admin002" },
  { id: "BM010", sentAt: "2026.03.16 09:00", status: "配信完了", target: "全会員", title: "セキュリティ強化のお知らせ", hasAttachment: false, authorName: "高橋 美咲", authorId: "admin004" },
  { id: "BM011", sentAt: "2026.03.15 14:00", status: "配信完了", target: "BtoB", title: "保証申請フォーム変更のお知らせ", hasAttachment: true, authorName: "田中 太郎", authorId: "admin001" },
  { id: "BM012", sentAt: "2026.03.14 11:30", status: "配信完了", target: "BtoC", title: "ポイントプログラム開始のお知らせ", hasAttachment: false, authorName: "鈴木 一郎", authorId: "admin003" },
  { id: "BM013", sentAt: "2026.03.13 16:00", status: "配信待ち", target: "全会員", title: "新機能追加のお知らせ", hasAttachment: true, authorName: "佐藤 花子", authorId: "admin002" },
  { id: "BM014", sentAt: "", status: "下書き", target: "BtoB", title: "【下書き】年末年始営業日程", hasAttachment: false, authorName: "高橋 美咲", authorId: "admin004" },
  { id: "BM015", sentAt: "2026.03.11 09:30", status: "配信完了", target: "BtoB", title: "施工マニュアル改訂版配信", hasAttachment: true, authorName: "田中 太郎", authorId: "admin001" },
];
