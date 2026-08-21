"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import { performLogout } from "@/lib/auth-client";
import { formatUserDisplayName } from "@/lib/format";
import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { AUTH_FLAG_KEY, AUTH_CHANGE_EVENT, dispatchAuthChange } from "@/components/login/types";
import { useMenuTree } from "@/hooks/use-menu-tree";
import { useMenuPermissionMap } from "@/hooks/use-menu-permission";
import { useAlertStore } from "@/lib/store";
import { ADMIN_MENU, MENU } from "@/lib/menu-codes";
import type { MenuApiItem, MenuTreeItem } from "@/components/admin/menus/menus-types";

/**
 * Gnb 상단 네비 fallback — 비로그인(게스트) 전용. お問い合わせ 미노출 (게스트 한정 요구사항).
 * 게스트에게 문의를 다시 노출하게 되면 이 배열에 항목을 추가하지 말고 두 배열을 하나로 합칠 것 —
 * AUTH 가 이 배열을 spread 하므로, 여기에 문의를 추가하면 AUTH 에서 중복 항목이 된다.
 */
const GNB_FALLBACK_MENUS_GUEST: readonly { menuCode: string; menuName: string; pageUrl: string }[] = [
  { menuCode: MENU.CONTENT, menuName: "コンテンツ", pageUrl: "/contents" },
];

/**
 * Gnb 상단 네비 fallback — 인증 사용자 전용.
 * menuTree 초기 로딩 중 / `/api/menus` 실패 시 사용되므로, 장애 상황에서도 문의 경로를 유지한다.
 * 단 hasAuthFlag 가 아직 false 인 SSR/hydration 이전 렌더에서는 GUEST 쪽이 선택된다 —
 * 상세는 아래 fallback 선택 로직 주석 참조.
 */
const GNB_FALLBACK_MENUS_AUTH: readonly { menuCode: string; menuName: string; pageUrl: string }[] = [
  ...GNB_FALLBACK_MENUS_GUEST,
  { menuCode: MENU.INQUIRY, menuName: "お問い合わせ", pageUrl: "/inquiry" },
];

/**
 * 앱 내부 링크로 허용되는 pageUrl 패턴 — 메뉴관리 DB 값이 공격 벡터가 되지 않도록 whitelist.
 * - 절대 경로만 (`/` 로 시작)
 * - `//` (protocol-relative), 공백, `:` (스킴), `@` 등 예기치 않은 문자 차단
 * - 허용 문자: 영숫자 / `-` / `_` / `/`
 * 관리자 계정 탈취 + 메뉴관리 경로 변조가 선행되어야 하는 낮은 리스크이나 심층 방어 목적.
 */
const SAFE_PAGE_URL = /^\/[a-zA-Z0-9\-_/]+$/;

/** 1-Level 메뉴에서 Gnb 노출 후보만 필터 (ADMIN 은 admin-tab 이 담당) */
function filterGnbMenus(
  tree: MenuTreeItem[] | undefined,
  mode: "pc" | "mobile",
): { menuCode: string; menuName: string; pageUrl: string }[] {
  if (!tree || tree.length === 0) return [];
  const visibleKey = mode === "pc" ? "showInTopNav" : "showInMobile";
  return tree
    .filter((m): m is MenuTreeItem & { pageUrl: string } =>
      m.isActive
      && m[visibleKey]
      && m.menuCode !== MENU.ADMIN
      && typeof m.pageUrl === "string"
      && m.pageUrl.length > 0
      && SAFE_PAGE_URL.test(m.pageUrl),
    )
    .sort((a: MenuApiItem, b: MenuApiItem) => a.sortOrder - b.sortOrder)
    .map((m) => ({ menuCode: m.menuCode, menuName: m.menuName, pageUrl: m.pageUrl }));
}

async function fetchAuthMe(): Promise<LoginUser | null> {
  try {
    const res = await api.get("/auth/login-user-info");
    const parsed = loginUserSchema.safeParse(res.data?.data);
    if (!parsed.success) {
      console.error("[fetchAuthMe] 응답 스키마 불일치:", parsed.error.issues);
      return null;
    }
    // 2차인증(또는 최초 비밀번호 설정) 미완료 세션은 "로그인 상태" 가 아니다 —
    // login-user-info 라우트는 verifyToken 만 하므로 2FA 전에도 200 을 준다. 여기서 승격하면
    // middleware(twoFactorVerified === false)가 다른 API 를 전부 403 으로 막는데 axios
    // 인터셉터는 401 만 정리하므로 플래그가 남아 빠져나올 수 없는 락인이 된다.
    // 로그인 라우트(login-contents.tsx)의 계약과 동일하게 비로그인으로 취급한다.
    if (!parsed.data.twoFactorVerified) return null;
    // 쿠키 세션은 살아있는데 localStorage AUTH_FLAG 만 없는 상태(브라우저·프로필 간 스토리지
    // 불일치, 스토리지 정리, 임베디드 브라우저 파티션 등)를 여기서 복구한다. 복구 경로가 없으면
    // 화면은 비로그인인데 /login 은 서버가 쿠키를 보고 `/` 로 리다이렉트해 재로그인도 불가능한
    // 데드락이 된다. (Orca 임베디드 브라우저에서 실제 재현)
    try {
      if (localStorage.getItem(AUTH_FLAG_KEY) !== "1") {
        localStorage.setItem(AUTH_FLAG_KEY, "1");
        dispatchAuthChange();
      }
    } catch (e) {
      console.warn("[fetchAuthMe] AUTH_FLAG_KEY 복구 실패:", e);
    }
    return parsed.data;
  } catch (err) {
    // 401(세션 만료) 처리는 axios 응답 인터셉터(src/lib/axios.ts)가 일원화 —
    // AUTH_FLAG_KEY 정리 + AUTH_CHANGE_EVENT 발행. 여기서는 401 외 에러만 로깅.
    if (!(err instanceof AxiosError) || err.response?.status !== 401) {
      console.error("[fetchAuthMe] 인증 확인 실패:", err);
    }
    return null;
  }
}

// 표시 순서 = ORDER → MUSUBI → DESIGN → WARRANTY (역할별 노출은 SITE_ACCESS_MAP 으로 필터)
// note: Q.WARRANTY 만 자동 로그인 미연동 → 단순 사이트 이동임을 명시.
type SiteValue = "qorder" | "qmusubi" | "hanasys" | "qwarranty";
type AutoLoginSiteValue = Exclude<SiteValue, "qwarranty">;
interface RelatedSite {
  label: string;
  value: SiteValue;
  href: string;
  note?: string;
}
// 환경별 URL — 클릭 시점에 hostname 기준으로 분기 선택 (NODE_ENV/APP_ENV 오염 영향 없음).
const RELATED_SITE_URLS_DEV: Record<AutoLoginSiteValue, string> = {
  qorder: "https://q-order-dev.q-cells.jp/",
  qmusubi: "https://q-musubi-dev.q-cells.jp/",
  hanasys: "https://dev.hanasys.jp/",
};
const RELATED_SITE_URLS_PROD: Record<AutoLoginSiteValue, string> = {
  qorder: "https://q-order.q-cells.jp/",
  qmusubi: "https://q-musubi.q-cells.jp/",
  hanasys: "https://www.hanasys.jp/",
};

/**
 * 운영 hostname 명시 allowlist (fail-closed).
 *
 * 이 목록에 정확히 일치하는 hostname 일 때만 prod URL 사용. 그 외 (개발/스테이징/preview/IP/loopback/unknown)
 * 는 모두 dev URL 로 폴백한다. PR description "운영 URL 노출 차단" 의도와 정렬.
 *
 * `toLowerCase()` 비교로 IDN/대소문자 변칙(`WWW.Q-PARTNERS.Q-CELLS.JP`) 도 정규화 처리.
 */
const PROD_HOSTS: readonly string[] = [
  "prod.q-partners.q-cells.jp",
] as const;

/**
 * 자동로그인 응답 URL 검증용 host 화이트리스트 (defense-in-depth).
 *
 * 서버측(`route.ts`)이 `AUTO_LOGIN_URL[target]` 을 안전 조립하지만, BFF 변경/침해/MITM 시
 * 임의 URL(`https://attacker/...`, `javascript:`, `data:`)이 응답에 포함될 가능성에 대비해
 * 클라이언트에서도 protocol(https:) + hostname 일치를 한 번 더 검증한다.
 */
const ALLOWED_REDIRECT_HOSTS: Record<AutoLoginSiteValue, readonly string[]> = {
  qorder: ["q-order.q-cells.jp", "q-order-dev.q-cells.jp"],
  qmusubi: ["q-musubi.q-cells.jp", "q-musubi-dev.q-cells.jp"],
  hanasys: ["www.hanasys.jp", "dev.hanasys.jp"],
};

function isSafeRedirect(raw: string, key: AutoLoginSiteValue): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:"
      && !u.username
      && !u.password
      && ALLOWED_REDIRECT_HOSTS[key].includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 현재 페이지 hostname 을 SSR-safe 하게 구독.
 *
 * SSR/initial render: 빈 문자열 → dev URL 폴백.
 * 클라이언트 mount 후: `window.location.hostname` 으로 수렴 → PROD_HOSTS 일치 시 prod URL.
 * React Compiler 규칙(`set-state-in-effect`) 준수를 위해 useEffect+setState 대신 useSyncExternalStore 사용.
 */
const subscribeNoop = () => () => {};
const getClientHostname = () => window.location.hostname.toLowerCase();
const getServerHostname = () => "";

// Q.WARRANTY 는 역할별 로그인 URL 분리 (ADMIN → admin_login, STORE → seller_login)
const QWARRANTY_URLS = {
  ADMIN: "https://q-warranty.q-cells.jp/admin_login",
  STORE: "https://q-warranty.q-cells.jp/seller_login",
} as const;

// SEKO(시공점), GENERAL(일반회원)은 関連サイト 미노출 — 의도적 제외
type SiteAccessKey = "ADMIN" | "1ST_STORE" | "2ND_STORE";
const SITE_ACCESS_MAP: Record<SiteAccessKey, SiteValue[]> = {
  ADMIN: ["qorder", "qmusubi", "hanasys", "qwarranty"],
  "1ST_STORE": ["qorder", "hanasys", "qwarranty"],
  "2ND_STORE": ["qmusubi", "hanasys", "qwarranty"],
};

function getUserSiteKey(user: LoginUser): SiteAccessKey | null {
  if (user.userTp === "ADMIN") return "ADMIN";
  if (user.userTp === "STORE") {
    if (user.storeLvl === "1") return "1ST_STORE";
    if (user.storeLvl === "2") return "2ND_STORE";
  }
  return null;
}

/**
 * 역할별 関連サイト 목록 — `<a href>` fallback URL 도 hostname 기반 환경 분기 결과를 사용.
 * 운영 hostname 일 때만 prod URL 인라인 → 우클릭/middle-click 새 탭 시 dev URL 노출 방지.
 */
function getRelatedSites(
  user: LoginUser,
  fallbackUrls: Record<AutoLoginSiteValue, string>,
): RelatedSite[] {
  const key = getUserSiteKey(user);
  if (!key) return [];
  const allowed = SITE_ACCESS_MAP[key];
  const qwarrantyHref = key === "ADMIN" ? QWARRANTY_URLS.ADMIN : QWARRANTY_URLS.STORE;
  const all: readonly RelatedSite[] = [
    { label: "HANASYS ORDER", value: "qorder", href: fallbackUrls.qorder },
    { label: "HANASYS MUSUBI", value: "qmusubi", href: fallbackUrls.qmusubi },
    { label: "HANASYS DESIGN", value: "hanasys", href: fallbackUrls.hanasys },
    { label: "オンライン保証システム", value: "qwarranty", href: qwarrantyHref, note: "(別途ログインが必要)" },
  ];
  return all.filter((site) => allowed.includes(site.value));
}

function subscribeAuthFlag(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === AUTH_FLAG_KEY) callback();
  };
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function Gnb() {
  const hasAuthFlag = useSyncExternalStore(
    subscribeAuthFlag,
    () => { try { return localStorage.getItem(AUTH_FLAG_KEY) === "1"; } catch (e) { console.warn("[Gnb] localStorage.getItem 실패:", e); return false; } },
    () => false,
  );

  const { data: user } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: fetchAuthMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: null,
    // 게이트 없이 항상 1회 프로브 — hasAuthFlag 는 첫 페인트 hint 일 뿐 인증의 truth 가 아니다.
    // 여기에 `enabled: hasAuthFlag` 를 걸면 플래그가 유실된 쿠키 세션을 영영 복구할 수 없다.
    // 비로그인 사용자는 401 1회(staleTime 5분, retry false) — 인터셉터는 플래그가 "1" 일 때만
    // 동작하므로 부수효과 없음.
  });
  const queryClient = useQueryClient();
  const router = useRouter();

  const isLoggedIn = user != null;
  // QSP userNm 이 공백 문자열인 경우(`"   "`) truthy 라 삼항 가드를 통과해 "　様" 만 단독
  // 렌더되는 회귀를 차단. 정규화 결과 빈 문자열이면 아예 렌더하지 않는다.
  const userDisplayName = formatUserDisplayName(user?.userNm);
  // SSR initial: "" → dev URL fallback. Client mount 후 운영 hostname 이면 prod URL 로 수렴.
  const hostname = useSyncExternalStore(subscribeNoop, getClientHostname, getServerHostname);
  const fallbackUrls = PROD_HOSTS.includes(hostname)
    ? RELATED_SITE_URLS_PROD
    : RELATED_SITE_URLS_DEV;
  const relatedSites = user ? getRelatedSites(user, fallbackUrls) : [];
  const showRelatedSites = relatedSites.length > 0;
  // 로그아웃 진행 상태 — 중복 클릭 방어 + 버튼 비활성화/로딩 표시.
  // QSP 호출 10초 타임아웃 동안 버튼이 멍하니 응답 없는 것처럼 보이는 UX 개선.
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 메뉴 트리 — 로그인 시점에만 fetch, 비로그인은 fallback. API 실패 시도 fallback 으로 수렴.
  const { data: menuTree } = useMenuTree({ enabled: hasAuthFlag });
  // fallback 선택 — hasAuthFlag=false 일 때만 문의를 제외한다.
  // 주의: false 는 "비로그인 확정" 이 아니라 "비로그인 또는 미확정" 이다 — SSR/hydration 이전
  // (getServerSnapshot=false) 과 localStorage 읽기 실패(catch→false) 에서도 false 가 된다.
  // 따라서 인증 사용자도 첫 페인트에는 GUEST 를 지나가고 hydration 후 AUTH 로 수렴한다
  // (로그인 버튼·톱니바퀴 등 기존 헤더 요소와 동일한 전환 패턴).
  // 게스트 한정 처리를 이 분기에 추가할 때는 위 미확정 케이스를 반드시 고려할 것.
  const fallbackMenus = hasAuthFlag ? GNB_FALLBACK_MENUS_AUTH : GNB_FALLBACK_MENUS_GUEST;
  const pcMenus = useMemo(() => {
    const filtered = filterGnbMenus(menuTree, "pc");
    return filtered.length > 0 ? filtered : fallbackMenus;
  }, [menuTree, fallbackMenus]);
  const mobileMenus = useMemo(() => {
    const filtered = filterGnbMenus(menuTree, "mobile");
    return filtered.length > 0 ? filtered : fallbackMenus;
  }, [menuTree, fallbackMenus]);

  // RBAC — GNB 메뉴 클릭 시 매트릭스 canRead 가 false 면 이동 차단 + alert.
  // 비로그인 상태는 기존 Link 동작(서버 가드가 /login 유도)을 그대로 사용.
  //
  // admin → 일반 이동 시 캐시 강제 무효화는 layout 의 <AdminTransitionRefresh /> 가
  // pathname 변화를 감지해 모든 진입점에 일괄 적용 — 헤더 측은 RBAC 만 담당.
  const { has, isLoading: isPermMapLoading } = useMenuPermissionMap();
  const { openAlert } = useAlertStore();

  // RBAC 매트릭스 단일화 — 관리자 진입(톱니바퀴)은 ADM_* 7개 중 1개라도 canRead=true 일 때만 노출.
  // 종전 `userTp === "ADMIN"` userTp 분기를 매트릭스 기반으로 교체 (권한관리 토글 결과 즉시 반영).
  // 비로그인은 hasAuthFlag 로 1차 차단, 로딩 중에는 fail-closed(숨김) 로 UX 플래시 방지.
  const canShowAdminEntry =
    hasAuthFlag &&
    !isPermMapLoading &&
    Object.values(ADMIN_MENU).some((menuCode) => has(menuCode, "read"));

  const handleGnbMenuClick = (e: React.MouseEvent<HTMLAnchorElement>, menuCode: string) => {
    if (!hasAuthFlag) return;
    if (!has(menuCode, "read")) {
      e.preventDefault();
      openAlert({ type: "alert", message: "アクセス権限がありません。" });
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await performLogout(queryClient);
      router.replace("/login");
    } finally {
      // 페이지 전환 후라도 안전하게 해제 — React 가 unmount 컴포넌트의 setState 는 무시.
      setIsLoggingOut(false);
    }
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  /**
   * 관련사이트 자동로그인 진행 상태 — 중복 클릭 방어용.
   * 값이 존재하면 해당 `SiteValue` 에 대해 POST /api/auth/auto-login/encrypt 호출 중.
   */
  const [autoLoginInFlight, setAutoLoginInFlight] = useState<SiteValue | null>(null);

  /**
   * 관련사이트 클릭 핸들러 — HANASYS DESIGN / Q.Order / Q.Musubi 자동로그인 처리.
   *
   * 흐름:
   *   1. qwarranty 는 자동로그인 미연동 → 기본 `<a href>` 동작 허용 (별도 로그인 페이지)
   *   2. 그 외 target 은 preventDefault → POST /api/auth/auto-login/encrypt
   *      → 응답 URL 을 `isSafeRedirect()` 로 검증 후 새 탭 이동 (fail-closed)
   *   3. API 실패/응답 누락/검증 실패 시 hostname 기반 fallback URL 로 이동
   *      (PROD_HOSTS 일치만 prod, 그 외 모두 dev)
   *   4. window.open 의 features(3번째 인자) 자체를 사용하지 않는다. features 가 들어가면
   *      일부 브라우저가 popup window 로 해석하여 target=_blank 새 탭과 navigation/Referer
   *      처리가 달라져 ORDER/MUSUBI 의 도메인 화이트리스트 검사가 차단된다.
   *      modern browser (Chrome 88+ / Firefox 79+ / Safari 14+) 는 cross-origin
   *      target=_blank window.open 시 자동으로 opener=null 처리하므로 noopener 명시 없이도
   *      reverse tabnabbing 방어는 동등하게 유지된다.
   *
   * Target 매핑: site.value ("qorder"/"qmusubi"/"hanasys") → API target ("qOrder"/"qMusubi"/"hanasys").
   */
  // e 타입은 SyntheticEvent — onClick(MouseEvent) / onKeyDown(KeyboardEvent) 양쪽에서 호출되며
  // 내부에서 e.preventDefault() 만 사용하므로 공통 베이스로 좁혀 이중 타입 단언을 제거한다.
  const handleRelatedSiteClick = async (
    e: React.SyntheticEvent<HTMLAnchorElement>,
    site: RelatedSite,
    closeMenu: () => void,
  ) => {
    // qwarranty 는 자동로그인 대상 아님 — anchor href(`QWARRANTY_URLS`) 그대로 동작 + 드롭다운/메뉴 닫기만 수행
    if (site.value === "qwarranty") {
      closeMenu();
      return;
    }
    // 여기부터는 자동로그인 3사(qorder/qmusubi/hanasys). anchor href 가 undefined 라
    // 기본 link 동작이 없으므로 모든 경로에서 명시적으로 window.open 을 호출해야 한다.
    e.preventDefault();
    closeMenu();

    // ADMIN + MUSUBI 는 자동로그인 미적용 — 미인증 상태로 MUSUBI 베이스 URL 새 탭 오픈
    //   → MUSUBI 측 로그인 페이지 진입. fallbackUrls 의 musubi 베이스 URL 사용.
    //   기존 anchor href 위임 방식은 hydration race 시 dev URL 로 잘못 이동하던 회귀가 있어
    //   onClick 명시 분기로 통일(2026-05-22).
    if (site.value === "qmusubi" && user?.userTp === "ADMIN") {
      window.open(fallbackUrls.qmusubi, "_blank");
      return;
    }
    if (autoLoginInFlight) return; // 중복 호출 방어
    // 이 시점부터 site.value 는 자동로그인 3사로 좁혀짐 — RELATED_SITE_URLS_* 인덱싱 안전성 확보.
    const siteKey: AutoLoginSiteValue = site.value;
    setAutoLoginInFlight(siteKey);
    const apiTarget =
      siteKey === "qorder" ? "qOrder"
      : siteKey === "qmusubi" ? "qMusubi"
      : "hanasys";
    // fallback URL — 컴포넌트 상위에서 hostname 기반으로 결정한 값을 그대로 사용.
    const fallbackUrl = fallbackUrls[siteKey];
    try {
      const res = await api.post<{ data: { url: string } }>(
        "/auth/auto-login/encrypt",
        { target: apiTarget },
      );
      const redirectUrl = res.data?.data?.url;
      // defense-in-depth — 서버측이 안전 조립하더라도 클라에서 protocol+hostname 한 번 더 검증.
      // BFF 변경/침해/MITM 시 임의 URL(`https://attacker/...`, `javascript:`, `data:`) 차단.
      if (!redirectUrl || !isSafeRedirect(redirectUrl, siteKey)) {
        console.error("[header] 자동로그인 응답 URL 차단 — fallback 이동");
        window.open(fallbackUrl, "_blank");
        return;
      }
      window.open(redirectUrl, "_blank");
    } catch (err: unknown) {
      console.error("[header] 자동로그인 실패 — fallback 이동:", err);
      // 실패 fallback — 환경별 URL 로 일반 이동 (미로그인 상태이지만 최소 접근성 유지)
      window.open(fallbackUrl, "_blank");
    } finally {
      setAutoLoginInFlight(null);
    }
  };

  // 로고 클릭은 SPA navigation 대신 풀 페이지 reload — F5 와 동일한 효과.
  // 다른 화면에서의 다운로드/등록 등 mutation 이 홈 위젯(最近ダウンロード 등)에
  // 즉시 반영되지 않던 결함 해결 (Redmine #2181).
  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Cmd/Ctrl/Shift+Click 및 좌클릭(button=0) 외 입력은 a 의 기본 동작을 유지 —
    // 새 탭/창 열기, 즐겨찾기 드래그 등 표준 브라우저 UX 가 막히던 회귀 제거.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.location.assign("/");
  };

  return (
    <div className="relative h-[68px] lg:h-[78px]">
      <header className="fixed top-0 left-0 flex items-center justify-center w-full bg-black z-9999 h-[68px] lg:h-[78px] py-4.5" style={{ viewTransitionName: "header" }}>
        <div className="flex items-center justify-between w-full max-w-[1440px] px-5 lg:px-0">
          {/* PC 로고 — 가로 1줄. 클릭 시 SPA 캐시 우회 풀 리로드 (Redmine #2181):
              다운로드 이력 위젯 등 다른 화면에서의 mutation 이 홈 위젯에 즉시 반영되지
              않던 문제(F5 로만 갱신) 해결. 우클릭/Cmd-클릭은 a 의 기본 동작 유지. */}
          <Link
            href="/"
            onClick={handleLogoClick}
            className="hidden lg:flex items-center gap-2 shrink-0 relative"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/asset/images/layout/logo_hanwha.svg"
              alt="Hanwha Japan"
              width={160}
              height={30}
            />
            <span className="w-px h-3 bg-[rgba(255,255,255,0.2)]" />
            <span className="font-pretendard font-medium text-[14px] leading-[1.5] text-white uppercase whitespace-nowrap">
              Q.PARTNERS
            </span>
          </Link>

          {/* 모바일 로고 — 세로 2줄 */}
          <Link
            href="/"
            onClick={handleLogoClick}
            className="flex lg:hidden flex-col shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/asset/images/layout/logo_hanwha.svg"
              alt="Hanwha Japan"
              width={133}
              height={24}
            />
            <span className="font-pretendard font-medium text-[12px] leading-[1.5] text-white uppercase whitespace-nowrap pl-[30px]">
              Q.PARTNERS
            </span>
          </Link>

          {/* PC 메뉴 영역 */}
          <nav className="hidden lg:flex flex-1 items-center self-stretch">
            <ul className="flex items-center gap-[54px] pl-[60px]">
              {pcMenus.map((menu) => (
                <li key={menu.menuCode}>
                  <Link
                    href={menu.pageUrl}
                    transitionTypes={["fade"]}
                    onClick={(e) => handleGnbMenuClick(e, menu.menuCode)}
                    className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white whitespace-nowrap transition-colors duration-200 hover:text-[#e97923]"
                  >
                    {menu.menuName}
                  </Link>
                </li>
              ))}
              {showRelatedSites && (
                <li className="relative">
                  <button
                    type="button"
                    className={`group flex items-center gap-1 font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] whitespace-nowrap transition-colors duration-200 ${
                      isDropdownOpen
                        ? "text-[#e97923]"
                        : "text-white hover:text-[#e97923]"
                    }`}
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                  >
                    関連サイト
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="transition-all duration-200"
                    >
                      <path
                        d={isDropdownOpen
                          ? "M5 7.5L10 12.5L15 7.5"
                          : "M7.5 15L12.5 10L7.5 5"
                        }
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* 関連サイト 드롭다운 패널 */}
                  <div
                    className={`absolute top-full left-0 mt-2 w-[200px] bg-white border border-black rounded-[12px] pt-[16px] pb-[24px] px-[18px] shadow-[0px_6px_32px_0px_rgba(0,0,0,0.05)] transition-all duration-200 ${
                      isDropdownOpen
                        ? "opacity-100 visible translate-y-0"
                        : "opacity-0 invisible -translate-y-1"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-[14px] border-b border-black">
                      <span className="font-['Noto_Sans_JP'] font-medium text-[13px] text-[#101010] leading-normal overflow-hidden text-ellipsis whitespace-nowrap">
                        関連サイト
                      </span>
                      <button
                        type="button"
                        aria-label="閉じる"
                        className="flex items-center justify-center size-[22px] bg-white rounded-full"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M9 1L1 9M1 1l8 8"
                            stroke="#000"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <ul className="flex flex-col gap-[13px]">
                      {relatedSites.map((site) => (
                        <li key={site.value}>
                          {/* qwarranty 만 정적 URL(`QWARRANTY_URLS`)로 anchor href 유지 — 일반 사이트 이동.
                              자동로그인 3사(qorder/qmusubi/hanasys)는 hostname 기반 fallback URL 이
                              hydration race 로 dev URL 인 채로 anchor 에 박혀 마우스 오버 시 dev URL
                              노출 + 일부 분기(ADMIN+qmusubi 단순 이동) 에서 dev URL 로 잘못 이동하던
                              회귀 차단(2026-05-22). href 제거 + onClick 단일 경로로 통일. */}
                          <a
                            href={site.value === "qwarranty" ? site.href : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-['Noto_Sans_JP'] font-normal leading-normal transition-colors duration-200 text-[#101010] hover:text-[#e97923] cursor-pointer"
                            aria-busy={autoLoginInFlight === site.value || undefined}
                            role={site.value === "qwarranty" ? undefined : "button"}
                            tabIndex={site.value === "qwarranty" ? undefined : 0}
                            onClick={(e) => { void handleRelatedSiteClick(e, site, () => setIsDropdownOpen(false)); }}
                            onKeyDown={site.value === "qwarranty" ? undefined : (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                void handleRelatedSiteClick(e, site, () => setIsDropdownOpen(false));
                              }
                            }}
                          >
                            <span className="block text-[13px] whitespace-nowrap">{site.label}</span>
                            {site.note && (
                              <span className="block text-[11px] text-[#888] whitespace-nowrap">
                                {site.note}
                              </span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              )}
            </ul>
          </nav>

          {/* PC 유틸 영역 */}
          <div className="hidden lg:flex items-center gap-5 shrink-0">
            {isLoggedIn ? (
              <>
                {/* 사용자 정보 */}
                <div className="flex items-center gap-1.5">
                  <Image
                    src="/asset/images/layout/icon_user.svg"
                    alt=""
                    width={24}
                    height={24}
                  />
                  <div className="flex items-center gap-2">
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      {user?.compNm ?? "-"}
                    </span>
                    <span className="w-px h-3 bg-[rgba(255,255,255,0.4)]" />
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      {userDisplayName ? `${userDisplayName}　様` : ""}
                    </span>
                  </div>
                </div>

                {/* 버튼 그룹 */}
                <div className="flex items-center gap-2">
                  <Link
                    href="/mypage"
                    transitionTypes={["fade"]}
                    onClick={(e) => handleGnbMenuClick(e, MENU.MYPAGE)}
                    className="flex items-center justify-center h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                  >
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      マイページ
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => { void handleLogout(); }}
                    disabled={isLoggingOut}
                    aria-busy={isLoggingOut || undefined}
                    className="flex items-center justify-center gap-1.5 h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14] disabled:opacity-60 disabled:cursor-wait disabled:hover:bg-[#252525] disabled:hover:border-[#313131]"
                  >
                    <Image
                      src="/asset/images/layout/icon_logout.svg"
                      alt=""
                      width={16}
                      height={16}
                    />
                    <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap">
                      {isLoggingOut ? "ログアウト中..." : "ログアウト"}
                    </span>
                  </button>
                  {/* 톱니바퀴 (管理者) — ADM_* 매트릭스 중 하나라도 canRead=true 일 때만 노출 */}
                  {canShowAdminEntry && (
                    <Link
                      href="/admin/members"
                      transitionTypes={["fade"]}
                      className="flex items-center justify-center size-[36px] bg-[#252525] border border-[#313131] rounded-[4px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                      aria-label="管理者設定"
                    >
                      <Image
                        src="/asset/images/layout/icon_admin.svg"
                        alt=""
                        width={21}
                        height={22}
                      />
                    </Link>
                  )}
                </div>
              </>
            ) : (
              // 既存Q.PARTNERS会員 셀프 회원가입 폐지 — 비로그인 헤더에 会員登録 진입점을 두지 않는다
              // (/signup 은 SUPER_ADMIN·ADMIN 전용 페이지로 전환됨).
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center justify-center h-[36px] bg-[#252525] border border-[#313131] rounded-[4px] overflow-hidden px-[10px] transition-colors duration-200 hover:bg-[#392211] hover:border-[#532f14]"
                >
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.4] text-[#d1d1d1] whitespace-nowrap ">
                    ログイン
                  </span>
                </Link>
              </div>
            )}
          </div>

          {/* 모바일 햄버거 메뉴 버튼 */}
          <button
            type="button"
            className="flex lg:hidden items-center justify-center size-6"
            aria-label="メニュー"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <Image
                src="/asset/images/layout/burger_btn.svg"
                alt=""
                width={24}
                height={24}
              />
            )}
          </button>
        </div>

        {/* 모바일 메뉴 — 딤 + 슬라이드 패널 */}
        {/* 딤 배경 */}
        <div
          className={`fixed inset-0 bg-[rgba(0,0,0,0.7)] transition-opacity duration-300 lg:hidden ${
            isMobileMenuOpen
              ? "opacity-100 visible"
              : "opacity-0 invisible"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* 슬라이드 패널 */}
        <div
          className={`fixed top-0 right-0 w-full max-w-[375px] h-full bg-black flex flex-col px-5 py-8 transition-transform duration-300 lg:hidden ${
            isMobileMenuOpen
              ? "translate-x-0"
              : "translate-x-full"
          }`}
        >
          {/* 상단: 유저 정보 + 닫기 */}
          <div className="flex items-start gap-12 mb-8">
            {isLoggedIn ? (
              <div className="flex flex-1 items-center gap-3">
                <div className="shrink-0 size-16 bg-white rounded-full overflow-hidden">
                  <Image
                    src="/asset/images/layout/icon_user.svg"
                    alt=""
                    width={64}
                    height={64}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-white">
                    {user?.compNm ?? "-"}
                  </span>
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#e97923]">
                    {userDisplayName ? `${userDisplayName}　様` : ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <button
              type="button"
              className="flex items-center justify-center size-8 bg-[#202020] rounded-full shrink-0"
              aria-label="閉じる"
              onClick={() => {
                setIsMobileMenuOpen(false);
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11 1L1 11M1 1l10 10"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 네비게이션 */}
          <nav className="flex flex-col flex-1">
            {/* 동적 메뉴 (API 기반, fallback 포함) */}
            {mobileMenus.map((menu) => (
              <Link
                key={menu.menuCode}
                href={menu.pageUrl}
                transitionTypes={["fade"]}
                className="flex items-center justify-between px-3 py-[18px] border-b border-[#1a1a1a]"
                onClick={(e) => {
                  handleGnbMenuClick(e, menu.menuCode);
                  // 매트릭스 거부 시 preventDefault 된 상태 — 그래도 drawer 는 닫는 게 UX 자연스러움.
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className="font-['Noto_Sans_JP'] font-semibold text-[15px] leading-[1.4] text-white">
                  {menu.menuName}
                </span>
                <svg
                  width="6"
                  height="10"
                  viewBox="0 0 6 10"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 9L5 5L1 1"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ))}

            {/* 関連サイト 모바일 미노출 — Q.ORDER / Q.MUSUBI / HANASYS DESIGN 등 외부 사이트가
                모바일을 지원하지 않아 바로가기를 제거한다. PC 영역에는 그대로 노출. */}
          </nav>

          {/* 하단 바 */}
          <div className="bg-[#121212] rounded-[12px] py-[14px] mt-auto">
            {isLoggedIn ? (
              <div className="flex items-center justify-around px-7">
                <Link
                  href="/mypage"
                  transitionTypes={["fade"]}
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] text-white whitespace-nowrap"
                  onClick={(e) => {
                    handleGnbMenuClick(e, MENU.MYPAGE);
                    // 매트릭스 거부 시 preventDefault 된 상태 — 그래도 drawer 는 닫는 게 UX 자연스러움 (일반 GNB 패턴과 통일).
                    setIsMobileMenuOpen(false);
                  }}
                >
                  マイページ
                </Link>
                <span className="w-px h-[10px] bg-[#5b5b5b]" />
                <button
                  type="button"
                  onClick={() => { void handleLogout(); }}
                  disabled={isLoggingOut}
                  aria-busy={isLoggingOut || undefined}
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.4] text-white uppercase whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
                >
                  {isLoggingOut ? "ログアウト中..." : "ログアウト"}
                </button>
              </div>
            ) : (
              // 既存Q.PARTNERS会員 셀프 회원가입 폐지 — PC 헤더와 동일하게 会員登録 진입점 제거.
              <div className="flex items-center justify-center gap-4 px-7">
                <Link
                  href="/login"
                  className="font-['Noto_Sans_JP'] font-medium text-[13px] text-white whitespace-nowrap flex-1 text-center"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  ログイン
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
