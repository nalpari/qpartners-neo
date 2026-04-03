import { userTpValues } from "@/lib/schemas/common";

export const VALID_TABS = ["dealer", "installer", "general"] as const;
export type TabType = (typeof VALID_TABS)[number];

export type UserTp = (typeof userTpValues)[number];

export const TAB_TO_USERTP: Record<TabType, UserTp> = {
  dealer: "STORE",
  installer: "SEKO",
  general: "GENERAL",
};

export const SAVED_ID_KEY = "savedLoginId";
export const SAVED_TAB_KEY = "savedLoginTab";
export const AUTH_FLAG_KEY = "qp-auth-active";
export const AUTH_CHANGE_EVENT = "qp-auth-change";

export function dispatchAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export const LOGIN_ERRORS = {
  INVALID_CREDENTIALS: "IDとパスワードが正しくありません！",
  SERVER_UNAVAILABLE: "サーバーに接続できません。しばらくしてからお試しください",
  BAD_REQUEST: "入力内容を確認してください",
  GENERIC: "ログインに失敗しました",
} as const;
