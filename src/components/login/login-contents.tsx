"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { LoginUser } from "@/lib/schemas/auth";
import { usePopupStore, useAppStore } from "@/lib/store";
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
  // 가입완료 후 ID 자동입력 — useRef로 초기값 스냅샷, useEffect로 cleanup (purity 준수)
  const prefillRef = useRef(useAppStore.getState().prefillEmail);

  const [activeTab, setActiveTab] = useState<TabType>(
    prefillRef.current ? "general" : initialSavedTab
  );
  const [id, setId] = useState(prefillRef.current || initialSavedId);

  useEffect(() => {
    if (prefillRef.current) {
      useAppStore.getState().clearPrefillEmail();
      prefillRef.current = "";
    }
  }, []);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(initialSavedId !== "");
  const [agreeTerms, setAgreeTerms] = useState(false);
  // notice: 자동로그인 실패 등 외부 유입 안내 — 입력 시 초기화하지 않음 (탭 전환 시만 초기화)
  const [notice, setNotice] = useState<string | null>(initialError);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const openPopup = usePopupStore((s) => s.openPopup);

  // 비밀번호 초기화 메일 → /login?reset-token=… 진입 시 verify 후 PersonalInfoPopup 자동 오픈.
  // useRef 로 첫 마운트 시점의 token 만 캡처해 1회만 처리한다 (개발 모드 StrictMode 더블 마운트 방어).
  const resetTokenRef = useRef(initialResetToken);
  useEffect(() => {
    if (!resetTokenRef.current) return;
    const t = resetTokenRef.current;
    resetTokenRef.current = null;

    let cancelled = false;
    void (async () => {
      try {
        const verifyRes = await api.post<{ data: { email?: string | null } }>(
          "/auth/password-reset/verify",
          { token: t },
        );
        if (cancelled) return;
        // verify 응답에 포함된 email 을 popup 의 read-only currentEmail 로 전달.
        // pwdInitYn=Y 케이스(이미 정상 회원의 비번 재설정) 정책 — 검증 없이 read-only 노출.
        const verifiedEmail = verifyRes.data?.data?.email ?? undefined;
        openPopup("personal-info", { token: t, currentEmail: verifiedEmail });
      } catch (err) {
        if (cancelled) return;
        console.error("[LoginContents] パスワード再設定リンク検証失敗:", err);
        if (isAxiosError(err) && err.response) {
          const data = err.response.data as Record<string, unknown> | undefined;
          const serverMsg = typeof data?.error === "string" ? data.error : null;
          setNotice(serverMsg ?? "無効または期限切れのリンクです。");
        } else {
          setNotice("サーバーに接続できません。しばらくしてからもう一度お試しください。");
        }
      } finally {
        // 토큰을 URL 에서 즉시 제거 — 새로고침 시 재처리/노출/공유 방지.
        if (!cancelled && typeof window !== "undefined") {
          window.history.replaceState({}, "", "/login");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [openPopup]);

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
    if (!agreeTerms) {
      setError("利用規約に同意してください");
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
    <main className="flex items-start justify-center w-full mt-[10px] lg:mt-0  lg:pb-[120px]">
      {/* 로딩 오버레이 — 전체 화면 dim + 클릭 차단 (탭/체크박스는 z-[51]로 위에 배치) */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Spinner size={48} className="text-white" />
        </div>
      )}
      <div className="flex w-full bg-white overflow-hidden lg:max-w-[1440px] lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)]">
        {/* PC 좌측 — 이미지 패널 */}
        <div className="hidden lg:flex relative flex-col items-start overflow-hidden rounded-l-[12px] w-[860px] shrink-0 min-h-[600px]">
          <Image
            src="/asset/images/contents/login_img.png"
            alt=""
            fill
            sizes="860px"
            className="object-cover"
            priority
          />
          
        </div>

        {/* 우측 — 로그인 폼 */}
        <section className="flex flex-col flex-1 w-full px-6 py-[34px] gap-[26px] lg:p-[80px] lg:gap-8">
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
            agreeTerms={agreeTerms}
            error={error ?? notice}
            isSubmitting={isSubmitting}
            onIdChange={(v) => { setId(v); setError(null); }}
            onPasswordChange={(v) => { setPassword(v); setError(null); }}
            onTogglePassword={() => setShowPassword((prev) => !prev)}
            onSaveIdChange={setSaveId}
            onAgreeTermsChange={setAgreeTerms}
            onClearId={() => { setId(""); setError(null); }}
            onSubmit={handleSubmit}
          />
          <LoginLinks activeTab={activeTab} />
        </section>
      </div>
    </main>
  );
}
