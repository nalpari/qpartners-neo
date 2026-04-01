export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: "Y" | "N";
  isNew?: boolean;
  isSaved?: boolean;
}

export const DUMMY_PERMISSIONS: PermissionItem[] = [
  { id: "P001", code: "SUPER_ADMIN", name: "スーパー管理者", description: "システム全体の管理権限を持つ最上位権限", isActive: "Y" },
  { id: "P002", code: "ADMIN", name: "管理者", description: "一般的な管理機能へのアクセス権限", isActive: "Y" },
  { id: "P003", code: "FIRST_DEALER", name: "1次販売店", description: "1次販売店向けの基本権限", isActive: "Y" },
  { id: "P004", code: "SECOND_DEALER", name: "2次以降販売店", description: "2次以降販売店向けの基本権限", isActive: "Y" },
  { id: "P005", code: "INSTALLER", name: "施工店", description: "施工店向けの基本権限", isActive: "Y" },
  { id: "P006", code: "GENERAL", name: "一般会員", description: "一般会員向けの基本権限", isActive: "Y" },
  { id: "P007", code: "GUEST", name: "ゲスト", description: "未ログインユーザーの閲覧権限", isActive: "N" },
  { id: "P008", code: "CONTENT_MANAGER", name: "コンテンツ管理者", description: "コンテンツの登録・編集・削除権限", isActive: "Y" },
  { id: "P009", code: "MAIL_SENDER", name: "メール配信者", description: "バルクメール配信権限", isActive: "Y" },
  { id: "P010", code: "REPORT_VIEWER", name: "レポート閲覧者", description: "各種レポートの閲覧のみ可能な権限", isActive: "N" },
];
