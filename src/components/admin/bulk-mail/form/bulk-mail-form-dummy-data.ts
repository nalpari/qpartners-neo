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
  targets: string[];
  title: string;
  content: string;
  attachments: AttachmentFile[];
}

/** 상세(detail) 모드 목업 데이터 */
export const DUMMY_DETAIL_DATA: BulkMailFormData = {
  senderName: "Q.PARTNERS事務局 (q.partners@hqj.co.jp)",
  authorName: "金志映",
  authorId: "admin001",
  sentAt: "2026.03.25 10:00",
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
  targets: [],
  title: "",
  content: "",
  attachments: [],
};
