export const VALID_TABS = ["dealer", "installer", "general"] as const;
export type TabType = (typeof VALID_TABS)[number];

export const SAVED_ID_KEY = "savedLoginId";
export const SAVED_TAB_KEY = "savedLoginTab";
export const AUTH_FLAG_KEY = "qp-auth-active";
export const AUTH_CHANGE_EVENT = "qp-auth-change";

export function dispatchAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}
