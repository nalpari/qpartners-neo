"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { LoginUser } from "@/lib/schemas/auth";
import { resetListRestoreState } from "@/hooks/use-list-state-persist";
import { usePopupStore } from "@/lib/store";
import { Spinner } from "@/components/common/spinner";
import { LoginTabs } from "@/components/login/login-tabs";
import { LoginForm } from "@/components/login/login-form";
import { LoginLinks } from "@/components/login/login-links";
import { SAVED_ID_KEY, SAVED_TAB_KEY, AUTH_FLAG_KEY, dispatchAuthChange, LOGIN_ERRORS, TAB_TO_USERTP } from "@/components/login/types";
import type { TabType } from "@/components/login/types";

const STATUS_ERROR_MAP: Record<number, string> = {
  400: LOGIN_ERRORS.BAD_REQUEST,
  401: LOGIN_ERRORS.INVALID_CREDENTIALS,
  // body 가 있으면 serverMsg 가 우선 사용됨. body 없는 403(프록시·CDN 차단 등) 시 폴백.
  403: LOGIN_ERRORS.FORBIDDEN,
  502: LOGIN_ERRORS.SERVER_UNAVAILABLE,
};

interface LoginContentsProps {
  initialSavedId?: string;
  initialSavedTab?: TabType;
  /** 서버에서 전달된 초기 error 메시지 (자동로그인 실패 등 외부 유입 안내) */
  initialError?: string | null;
  /** 비밀번호 초기화 메일 reset-token — verify 통과 시 PersonalInfoPopup(会員情報の設定) 자동 오픈 */
  initialResetToken?: string | null;
}

export function LoginContents({ initialSavedId = "", initialSavedTab = "dealer", initialError = null, initialResetToken = null }: LoginContentsProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialSavedTab);
  const [id, setId] = useState(initialSavedId);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(initialSavedId !== "");
  // notice: 자동로그인 실패 등 외부 유입 안내 — 입력 시 초기화하지 않음 (탭 전환 시만 초기화)
  const [notice, setNotice] = useState<string | null>(initialError);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const openPopup = usePopupStore((s) => s.openPopup);

  // 비밀번호 초기화 메일 → /login?reset-token=… 진입 시 verify 후 PersonalInfoPopup 자동 오픈.
  // useRef 로 첫 마운트 시점의 token 만 캡처해 1회만 처리한다 (개발 모드 StrictMode 더블 마운트 방어).
  // openPopup 은 zustand store action 으로 일반적으로 안정 참조이지만, 의존성 배열에 두면 재실행 시
  // cancelled cleanup 이 진행 중인 fetch 를 끊어버리는 race 가 있어 effect 외부에서 getState() 로 직접
  // 참조한다. 의존성 배열은 mount-only 의도이므로 빈 배열 사용.
  const resetTokenRef = useRef(initialResetToken);
  useEffect(() => {
    if (!resetTokenRef.current) return;
    const t = resetTokenRef.current;
    resetTokenRef.current = null;

    // verify fetch 전에 URL 에서 토큰 즉시 제거 — fetch 와 popup open 사이 외부 리소스가 로드될 경우
    // Referer 헤더로 토큰 유출되는 채널을 사전 차단. (성공/실패 어느 경로든 토큰 URL 잔존이 없음)
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/login");
    }

    let cancelled = false;
    void (async () => {
      try {
        const verifyRes = await api.post<{ data: { email?: string | null } }>(
          "/auth/password-reset/verify",
          { token: t },
        );
        if (cancelled) return;
        // verify 응답에 포함된 (마스킹된) email 을 popup 의 read-only currentEmail 로 전달.
        // pwdInitYn=Y 케이스(이미 정상 회원의 비번 재설정) 정책 — 검증 없이 read-only 노출.
        const verifiedEmail = verifyRes.data?.data?.email ?? undefined;
        usePopupStore.getState().openPopup("personal-info", { token: t, currentEmail: verifiedEmail });
      } catch (err) {
        if (cancelled) return;
        console.error("[LoginContents] 비밀번호 재설정 링크 검증 실패:", err);
        if (isAxiosError(err) && err.response) {
          const data = err.response.data as Record<string, unknown> | undefined;
          const serverMsg = typeof data?.error === "string" ? data.error : null;
          setNotice(serverMsg ?? "無効または期限切れのリンクです。");
        } else {
          setNotice("サーバーに接続できません。しばらくしてからもう一度お試しください。");
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (params: { loginId: string; pwd: string; userTp: string }) => {
      const res = await api.post<{ data: LoginUser }>("/auth/login", params);
      return res.data.data;
    },
    onSuccess: (userData, variables) => {
      try {
        if (saveId) {
          localStorage.setItem(SAVED_ID_KEY, variables.loginId);
        } else {
          localStorage.removeItem(SAVED_ID_KEY);
        }
        localStorage.setItem(SAVED_TAB_KEY, activeTab);
      } catch (storageErr) {
        console.error("[LoginContents] localStorage 쓰기 실패:", storageErr);
      }

      // 분기 순서: pwdInitYn=N (최초 로그인) → personal-info popup 우선 + 2FA skip,
      //            그 외 → 기존 2FA / 홈 이동.
      // (Design Ref: §4.1 — pwdInitYn=N 회원정보 설정 우선 정책)
      if (userData.pwdInitYn === "N") {
        // 최초 로그인 — 회원정보 설정 popup 진입. 이메일 미등록도 popup 내부에서 입력+중복체크 처리.
        openPopup("personal-info", {
          currentEmail: userData.email ?? undefined,
          userId: userData.userId,
          userTp: userData.userTp,
          pwdInitYn: "N",
        });
      } else if (!userData.twoFactorVerified) {
        // 2FA 미완료: 인증 플래그 미설정, 헤더는 비로그인 유지.
        // userTp 는 응답의 userData.userTp 를 사용 — 탭에서 변환한 값(TAB_TO_USERTP)을 쓰면
        // QSP 가 확정한 실제 회원유형과 어긋나 verify 라우트에서 403 으로 떨어진다.
        if (!userData.email) {
          // 이메일 미등록 사용자는 2FA 인증번호 발송 불가 → 로그인 차단 + 안내
          setError("2段階認証に必要なメール情報が登録されていません。管理者にお問い合わせください。");
          return;
        }
        openPopup("two-factor-auth", { userId: userData.userId, userTp: userData.userTp });
      } else {
        // 2FA 완료 또는 미요구: 캐시 세팅 → 플래그 설정 → 이벤트 발행 순서 보장
        queryClient.setQueryData(["auth", "login-user-info"], userData);
        try {
          localStorage.setItem(AUTH_FLAG_KEY, "1");
        } catch (storageErr) {
          console.error("[LoginContents] AUTH_FLAG 쓰기 실패:", storageErr);
        }
        dispatchAuthChange();
        // 계정 전환 경계 — 세션 만료로 로그아웃을 거치지 않고 사용자가 바뀌는 경로가 있으므로
        // 로그인 성공 시점에도 이전 사용자의 목록 복원 상태를 폐기한다 (Redmine #2490).
        resetListRestoreState();
        router.replace("/");
      }
    },
    onError: (err) => {
      console.error("[LoginContents] ログイン失敗:", {
        status: isAxiosError(err) ? err.response?.status : undefined,
        code: isAxiosError(err) ? err.code : undefined,
      });
      if (isAxiosError(err) && err.response) {
        const data = err.response.data as Record<string, unknown> | undefined;
        const serverMsg = typeof data?.error === "string" ? data.error : null;
        setError(serverMsg ?? STATUS_ERROR_MAP[err.response.status] ?? LOGIN_ERRORS.GENERIC);
      } else {
        setError(LOGIN_ERRORS.SERVER_UNAVAILABLE);
      }
    },
  });

  const isSubmitting = loginMutation.isPending;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setId("");
    setPassword("");
    setShowPassword(false);
    setNotice(null);
    setError(null);
  };

  const handleSubmit = () => {
    if (!id.trim()) {
      setError("IDを入力してください");
      return;
    }
    if (!password.trim()) {
      setError("パスワードを入力してください");
      return;
    }

    setError(null);
    loginMutation.mutate({
      loginId: id,
      pwd: password,
      userTp: TAB_TO_USERTP[activeTab],
    });
  };

  return (
    <main className="flex flex-col items-center w-full mt-[10px] lg:mt-0  lg:pb-[120px]">
      {/* 로딩 오버레이 — 전체 화면 dim + 클릭 차단 (탭/체크박스는 z-[51]로 위에 배치) */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Spinner size={48} className="text-white" />
        </div>
      )}
      <div className="flex flex-col w-full bg-white overflow-hidden lg:max-w-[1440px] lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
        <div className="flex w-full">
          {/* PC 좌측 — 이미지 패널 */}
          {/* 높이 702px 고정 — 세 탭 중 가장 높은 폼(에러 배너 표시 시 702.8px)에 맞춘 값이다.
              패널이 폼보다 높아 카드 높이를 패널이 결정하므로 하단 흰 여백이 생기지 않는다.

              폭은 카드 폭에 따라 3단계다. 패널이 shrink-0 이라 폼 컬럼은 카드에서 패널을
              뺀 나머지를 갖는데, 설계폭(카드 1440px)의 860px 를 좁은 화면에서도 유지하면
              폼이 고갈된다 — 안내문구가 4줄까지 접혀 폼이 782px 로 늘어나 여백이 80px 생기고,
              탭 슬롯도 81px 로 줄어 라벨(131px)이 넘친다. 그래서 2xl(1536px) 부터만 860px 를
              쓰고, 그 미만에서는 패널을 좁혀 폼 폭을 확보한다.
              ※ 명명된 브레이크포인트를 쓴다 — min-[1456px] 같은 임의 미디어 변형은 Tailwind 가
                lg/xl 보다 앞에 배치해 넓은 화면에서 lg 값에 밀린다(실측 확인).

              object-left — 원본 860x682 를 H=702 로 덮으면 배율 1.0293, 렌더 폭 885.2px 다.
              기본값(가운데)으로 자르면 패널이 좁을수록 좌측이 크게 잘려 Q.PARTNERS 로고가
              사라진다(패널 520px 기준 좌측 182px 크롭). 좌측 정렬하면 어느 폭에서든 로고
              좌측 여백이 63.8px 로 원본(62px)과 거의 같고, 대신 우측 발광부가 잘린다. */}
          <div className="hidden lg:block relative overflow-hidden shrink-0 h-[702px] lg:w-[520px] xl:w-[640px] 2xl:w-[860px]">
            <Image
              src="/asset/images/contents/login_img.png"
              alt=""
              fill
              sizes="(min-width: 1536px) 860px, (min-width: 1280px) 640px, 520px"
              className="object-cover object-left"
              priority
            />
          </div>

          {/* 우측 — 로그인 폼 */}
          {/* lg:pb-[60px] — 안내문구가 추가되며 늘어난 폼 높이를 흡수하는 값이다.
              80px 이면 에러 배너 표시 시 폼이 좌측 패널(702px)보다 높아져 여백이 생긴다.
              3개 탭 공통 적용.
              lg:px-[40px] — 좌우 패딩 160px 는 설계폭에서만 감당 가능하다. 카드가 좁을 때는
              패딩만으로 탭 슬롯이 라벨(131px)보다 작아지므로 절반으로 줄인다.
              lg:min-w-0 — flex item 의 자동 최소 폭은 min-content 라, 이 값이 없으면 섹션이
              min-content 폭을 고수하며 카드 밖으로 넘쳐 우측 패딩이 잘린다(카드 1265px 기준 16px). */}
          <section className="flex flex-col flex-1 w-full px-6 py-[34px] gap-[26px] lg:min-w-0 lg:px-[40px] lg:pt-[80px] lg:pb-[60px] lg:gap-8 2xl:px-[80px]">
            {/* 로딩 중에도 탭/체크박스 클릭 허용 — 오버레이(z-50) 위 */}
            <div className="relative z-[51]">
              <LoginTabs activeTab={activeTab} onChange={handleTabChange} />
            </div>
            <LoginForm
              activeTab={activeTab}
              id={id}
              password={password}
              showPassword={showPassword}
              saveId={saveId}
              error={error ?? notice}
              isSubmitting={isSubmitting}
              onIdChange={(v) => { setId(v); setError(null); }}
              onPasswordChange={(v) => { setPassword(v); setError(null); }}
              onTogglePassword={() => setShowPassword((prev) => !prev)}
              onSaveIdChange={setSaveId}
              onClearId={() => { setId(""); setError(null); }}
              onSubmit={handleSubmit}
            />
            <LoginLinks activeTab={activeTab} />

            {/* 既存Q.PARTNERS会員 탭 전용 안내 — 대상 회원 범위 및 신규등록 미접수 고지.
                -mt-3/-mt-4 는 부모 section 의 gap-[26px]/lg:gap-8 을 부분 상쇄하는 값이다.
                → section 의 gap 을 바꾸면 이 값도 함께 조정해야 한다. */}
            {activeTab === "general" && (
              <div className="flex flex-col w-full -mt-3 lg:-mt-4 px-3 py-2 bg-[#F7F9FB] rounded-[8px] font-['Noto_Sans_JP'] text-[11px] leading-[1.6] text-[#666]">
                <p>
                  既存Q.PARTNERS（2026年8月以前）に登録された会員のうち販売店会員と施工店会員に該当されない方はこちらからログインしてください。
                </p>
                <p>販売店会員・施工店会員以外の新規登録は受け付けておりません。</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
