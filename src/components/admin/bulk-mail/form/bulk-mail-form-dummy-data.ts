export interface RecipientItem {
  id: string;
  nameOrId: string;
  email: string;
}

export interface AttachmentFile {
  id: string;
  name: string;
  size: number;
}

export interface BulkMailFormData {
  senderName: string;
  authorName: string;
  authorId: string;
  sentAt: string;
  ccRecipients: RecipientItem[];
  bccRecipients: RecipientItem[];
  targets: string[];
  title: string;
  content: string;
  attachments: AttachmentFile[];
}

/** react-select용 수신자 검색 옵션 */
export interface RecipientOption {
  value: string;
  label: string;
  email: string;
}

export const RECIPIENT_OPTIONS: RecipientOption[] = [
  { value: "user001", label: "田中 太郎 (user001)", email: "tanaka@example.com" },
  { value: "user002", label: "佐藤 花子 (user002)", email: "sato@example.com" },
  { value: "user003", label: "鈴木 一郎 (user003)", email: "suzuki@example.com" },
  { value: "user004", label: "高橋 美咲 (user004)", email: "takahashi@example.com" },
  { value: "user005", label: "伊藤 健二 (user005)", email: "ito@example.com" },
  { value: "user006", label: "渡辺 裕子 (user006)", email: "watanabe@example.com" },
  { value: "user007", label: "山本 大輔 (user007)", email: "yamamoto@example.com" },
  { value: "user008", label: "中村 真理 (user008)", email: "nakamura@example.com" },
];

/** 상세(detail) 모드 목업 데이터 */
export const DUMMY_DETAIL_DATA: BulkMailFormData = {
  senderName: "Q.PARTNERS事務局 (q.partners@hqj.co.jp)",
  authorName: "金志映",
  authorId: "admin001",
  sentAt: "2026.03.25 10:00",
  ccRecipients: [
    { id: "cc1", nameOrId: "田中 太郎 (user001)", email: "tanaka@example.com" },
    { id: "cc2", nameOrId: "佐藤 花子 (user002)", email: "sato@example.com" },
  ],
  bccRecipients: [
    { id: "bcc1", nameOrId: "鈴木 一郎 (user003)", email: "suzuki@example.com" },
  ],
  targets: ["admin", "first-dealer"],
  title: "【重要】システムメンテナンスのお知らせ",
  content: "関係者の皆さまへ\n\n下記日程にてシステムメンテナンスを実施いたします。\n\n日時：2026年4月1日（水）22:00〜翌4:00\n対象：Q.PARTNERSシステム全般\n\nメンテナンス中はサービスをご利用いただけません。\nご不便をおかけしますが、何卒ご了承ください。\n\nQ.PARTNERS事務局",
  attachments: [
    { id: "att1", name: "メンテナンス案内.pdf", size: 245000 },
  ],
};

/** 등록(create) 모드 초기값 */
export const EMPTY_FORM_DATA: BulkMailFormData = {
  senderName: "Q.PARTNERS事務局 (q.partners@hqj.co.jp)",
  authorName: "金志映",
  authorId: "admin001",
  sentAt: "",
  ccRecipients: [],
  bccRecipients: [],
  targets: [],
  title: "",
  content: "",
  attachments: [],
};
