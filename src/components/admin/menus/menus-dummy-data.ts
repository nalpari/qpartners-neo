export interface MenuItem {
  id: string;
  parentId: string | null;
  menuCode: string;
  menuName: string;
  pageUrl: string;
  isActive: "Y" | "N";
  showInTopNav: "Y" | "N";
  showInMobile: "Y" | "N";
  sortOrder: number;
}

export interface MenuFormState {
  upperMenu: string;
  menuCode: string;
  menuName: string;
  pageUrl: string;
  isActive: "Y" | "N";
  showInTopNav: "Y" | "N";
  showInMobile: "Y" | "N";
}

export const EMPTY_FORM: MenuFormState = {
  upperMenu: "",
  menuCode: "",
  menuName: "",
  pageUrl: "",
  isActive: "Y",
  showInTopNav: "Y",
  showInMobile: "Y",
};

export const DUMMY_MENUS: MenuItem[] = [
  // 1-Level
  { id: "1", parentId: null, menuCode: "SEARCH", menuName: "統合検索", pageUrl: "/search", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 1 },
  { id: "2", parentId: null, menuCode: "CONTENT", menuName: "コンテンツ", pageUrl: "/contents", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 2 },
  { id: "3", parentId: null, menuCode: "INQUIRY", menuName: "お問合せ", pageUrl: "/inquiry", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 3 },
  { id: "4", parentId: null, menuCode: "MYPAGE", menuName: "マイページ", pageUrl: "/mypage", isActive: "Y", showInTopNav: "N", showInMobile: "Y", sortOrder: 4 },
  { id: "5", parentId: null, menuCode: "ADMIN", menuName: "管理者", pageUrl: "/admin", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 5 },
  { id: "6", parentId: null, menuCode: "DOWNLOAD", menuName: "ダウンロード", pageUrl: "/downloads", isActive: "N", showInTopNav: "N", showInMobile: "N", sortOrder: 6 },

  // 2-Level — 統合検索
  { id: "101", parentId: "1", menuCode: "SEARCH_LIST", menuName: "検索一覧", pageUrl: "/search/list", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 1 },

  // 2-Level — コンテンツ
  { id: "201", parentId: "2", menuCode: "CONT_LIST", menuName: "コンテンツ一覧", pageUrl: "/contents/list", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 1 },
  { id: "202", parentId: "2", menuCode: "CONT_DETAIL", menuName: "コンテンツ詳細", pageUrl: "/contents/detail", isActive: "Y", showInTopNav: "N", showInMobile: "Y", sortOrder: 2 },
  { id: "203", parentId: "2", menuCode: "CONT_CREATE", menuName: "コンテンツ登録", pageUrl: "/contents/create", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 3 },

  // 2-Level — お問合せ
  { id: "301", parentId: "3", menuCode: "INQ_LIST", menuName: "お問合せ一覧", pageUrl: "/inquiry/list", isActive: "Y", showInTopNav: "Y", showInMobile: "Y", sortOrder: 1 },
  { id: "302", parentId: "3", menuCode: "INQ_FORM", menuName: "お問合せフォーム", pageUrl: "/inquiry/form", isActive: "Y", showInTopNav: "N", showInMobile: "Y", sortOrder: 2 },

  // 2-Level — マイページ
  { id: "401", parentId: "4", menuCode: "MY_INFO", menuName: "会員情報", pageUrl: "/mypage/info", isActive: "Y", showInTopNav: "N", showInMobile: "Y", sortOrder: 1 },
  { id: "402", parentId: "4", menuCode: "MY_DOWNLOAD", menuName: "ダウンロード履歴", pageUrl: "/mypage/downloads", isActive: "Y", showInTopNav: "N", showInMobile: "Y", sortOrder: 2 },

  // 2-Level — 管理者
  { id: "501", parentId: "5", menuCode: "ADM_MEMBER", menuName: "会員管理", pageUrl: "/admin/members", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 1 },
  { id: "502", parentId: "5", menuCode: "ADM_NOTICE", menuName: "お知らせ管理", pageUrl: "/admin/notices", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 2 },
  { id: "503", parentId: "5", menuCode: "ADM_PERM", menuName: "権限管理", pageUrl: "/admin/permissions", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 3 },
  { id: "504", parentId: "5", menuCode: "ADM_MENU", menuName: "メニュー管理", pageUrl: "/admin/menus", isActive: "Y", showInTopNav: "N", showInMobile: "N", sortOrder: 4 },
];
