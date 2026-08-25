"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { validatePasswordPolicy } from "@/lib/schemas/signup";
import { Button } from "@/components/common";
import { type TabType, VALID_TABS, TAB_TO_USERTP } from "@/components/login/types";

/**
 * 비밀번호 재설정 popup 가상 page_view 경로 — Redmine #2216 note-2 후속.
 *
 * `/password-reset` 라우트는 server-side redirect 로 `/login?reset-token=…` 에 마운트된다.
 * GA4 의 자동 page_view (gtag.js Enhanced Measurement) 는 redirect 후 URL 인 `/login` 만
 * 잡으므로 일반 로그인과 funnel 이 구분되지 않는다. popup 마운트 시점에 본 가상 경로로
 * 별도 page_view 를 1회 발송하여 GA4 콘솔에서 분리 측정 가능하게 한다.
 */
const VIRTUAL_PAGE_PATH = "/login/password-reset";

const MEMBER_TYPES: { key: TabType; label: string }[] = [
  { key: "dealer", label: "販売店会員" },
  { key: "installer", label: "施工店会員" },
  { key: "general", label: "既存Q.PARTNERS会員" },
];

interface ResetFormData {
  id: string;
  email: string;
  idEmail: string;
  /** 시공점 전용 — 화면설계서 v1.4 p12 는 이메일이 아니라 시공ID 를 받는다. */
  sekoId: string;
  newPassword: string;
  confirmPassword: string;
}

const INITIAL_FORM: ResetFormData = {
  id: "",
  email: "",
  idEmail: "",
  sekoId: "",
  newPassword: "",
  confirmPassword: "",
};

const CLOSE_ANIMATION_MS = 200;

/** 재설정 토큰 만료·소비 시 안내 — 서버 문구와 같은 취지(1단계부터 다시). */
const SEKO_RESTART_MESSAGE =
  "初期化の有効期限が切れました。施工IDの確認からもう一度お試しください。";

/**
 * 시공점 초기화 단계 — 화면설계서 v1.4 p12.
 *  `identify`     : 시공ID 입력 → 존재 확인 (p12 좌측 팝업)
 *  `set-password` : 신규 비밀번호 설정 → 저장 (p12 우측 「비밀번호 설정」 팝업)
 *
 * 판매점·일반은 기존대로 메일 링크 방식이라 단계 개념이 없다(`identify` 고정).
 */
type SekoStep = "identify" | "set-password";

/** p12 의 「시공ID: 2***」 표기 — 앞 1자만 남긴다. */
function maskSekoId(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return `${v.slice(0, 1)}***`;
}

/**
 * Zod 실패 응답(`{ error: "Validation failed", fields: [{ field, message }] }`)에서
 * 사용자에게 보일 첫 메시지를 꺼낸다. 형태가 다르면 `null` 을 돌려 호출부가 fallback 을 쓴다.
 */
function extractFieldMessage(data: Record<string, unknown> | undefined): string | null {
  if (!data || !Array.isArray(data.fields)) return null;
  for (const item of data.fields) {
    if (typeof item !== "object" || item === null) continue;
    const message = (item as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return null;
}

/**
 * 시공점 2단계 입력 검증 — `sekoPasswordResetSchema` 와 같은 기준을 클라이언트에서 먼저 적용한다.
 *
 * 공란 여부만 보면 정책 위반·재입력 불일치가 서버 Zod 까지 흘러가 `"Validation failed"` 로
 * 돌아온다(라우트가 영어 상수를 `error` 에 싣는다). 가장 흔한 두 입력 오류를 영어로 알리지
 * 않도록 여기서 막는다 — 검증 자체는 서버가 정본이고 이건 UX 용 1차 거름망이다.
 */
function isSekoPasswordValid(data: ResetFormData): boolean {
  return (
    validatePasswordPolicy(data.newPassword) &&
    data.confirmPassword !== "" &&
    data.newPassword === data.confirmPassword
  );
}

function isFormValid(tab: TabType, data: ResetFormData, step: SekoStep): boolean {
  switch (tab) {
    case "dealer":
      return data.id.trim() !== "" && data.email.trim() !== "";
    case "installer":
      return step === "identify" ? data.sekoId.trim() !== "" : isSekoPasswordValid(data);
    case "general":
      return data.idEmail.trim() !== "";
  }
}

export function PasswordResetPopup() {
  const { popupData, closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();
  const rawTab = popupData.activeTab;
  const activeTab: TabType = VALID_TABS.includes(rawTab as TabType) ? (rawTab as TabType) : "dealer";
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState<ResetFormData>({ ...INITIAL_FORM });
  const [sekoStep, setSekoStep] = useState<SekoStep>("identify");
  /**
   * 시공점 1단계 응답으로 받은 재설정 토큰 — 2단계 저장 요청에 그대로 실어 보낸다.
   * 서버는 이 토큰이 지목하는 계정을 재설정 대상으로 삼는다(`seko/reset` 라우트 주석 참조).
   * URL·메일을 타지 않고 이 state 에만 머무르므로 브라우저 이력·수신함에 남지 않는다.
   */
  const [sekoResetToken, setSekoResetToken] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // popup 마운트 1회 — 비밀번호 재설정 진입 가상 page_view 발송 (Redmine #2216 note-2).
  //   - PopupController 가 activePopup === "password-reset" 일 때만 본 컴포넌트를 마운트하므로
  //     본 effect 1회 발송 = popup 진입 1회 카운트로 매핑된다.
  //   - GA4 콘솔 "페이지 경로" 보고서에 `/login/password-reset` 가 별도 행으로 분리되어
  //     `/login` 트래픽과 구분 측정 가능.
  //   - window.gtag 미정의(광고 차단·gtag.js 미로드) 시 조용히 스킵 — UX 영향 0.
  useEffect(() => {
    if (typeof window === "undefined" || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: VIRTUAL_PAGE_PATH,
      page_location: `${window.location.origin}${VIRTUAL_PAGE_PATH}`,
    });
  }, []);

  const handleChange = (key: keyof ResetFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setFormData({ ...INITIAL_FORM });
      setSekoStep("identify");
      setSekoResetToken(null);
      setIsSubmitting(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  /**
   * 시공점 1단계로 되돌리기 — 재설정 토큰이 만료·소비된 경우.
   * 토큰과 함께 입력한 비밀번호도 버린다(죽은 토큰에 묶인 입력이 남아 재시도 시 혼동된다).
   */
  const backToSekoIdentify = () => {
    setSekoResetToken(null);
    setFormData((prev) => ({ ...prev, newPassword: "", confirmPassword: "" }));
    setSekoStep("identify");
  };

  /**
   * 서버 에러 응답 → Alert 공통 처리.
   *
   * Zod 실패 응답의 `error` 는 `"Validation failed"` 라는 영어 상수라 그대로 띄우면 일본어
   * 화면에 영어가 노출된다. 사용자가 읽을 문구는 `fields[].message` 쪽에 있으므로 그것을
   * 우선 쓰고, 없을 때만 `error` → `fallback` 순으로 내려간다.
   */
  const alertError = (err: unknown, fallback: string) => {
    console.error("[PasswordResetPopup] パスワード初期化リクエスト失敗:", err);
    if (isAxiosError(err) && err.response) {
      const data = err.response.data as Record<string, unknown> | undefined;
      const errMsg =
        extractFieldMessage(data) ?? (typeof data?.error === "string" ? data.error : fallback);
      openAlert({ type: "alert", message: errMsg });
      return;
    }
    openAlert({
      type: "alert",
      message: "サーバーに接続できません。しばらくしてからもう一度お試しください。",
    });
  };

  /**
   * 시공점 1단계 — 시공ID 존재 확인 (p12 ④).
   * 성공하면 팝업을 닫지 않고 「비밀번호 설정」 단계로 전환한다.
   */
  const handleSekoIdentify = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post<{ data: { exists: boolean; resetToken: string } }>(
        "/auth/password-reset/seko/check",
        { sekoId: formData.sekoId },
      );
      const issued = res.data?.data?.resetToken;
      if (!issued) {
        // 토큰 없이 2단계로 넘기면 저장 시점에 반드시 410 이 되어 입력이 버려진다.
        // 여기서 멈추고 재시도를 안내한다.
        console.error("[PasswordResetPopup] 재설정 토큰 미수신 — 2단계 진입 중단");
        openAlert({
          type: "alert",
          message: "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。",
        });
        return;
      }
      setSekoResetToken(issued);
      setSekoStep("set-password");
    } catch (err) {
      alertError(err, "サーバーエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 시공점 2단계 — 신규 비밀번호 저장 (p12 ⑧).
   * 저장 후 **자동 로그인하지 않는다** — p12 의 완료 Alert 가 「변경된 비밀번호로 로그인해주세요」다.
   */
  const handleSekoReset = async () => {
    if (!sekoResetToken) {
      // 1단계를 거치지 않았거나 토큰을 잃은 상태 — 서버도 410 으로 거부한다.
      openAlert({ type: "alert", message: SEKO_RESTART_MESSAGE });
      backToSekoIdentify();
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/auth/password-reset/seko/reset", {
        sekoId: formData.sekoId,
        resetToken: sekoResetToken,
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword,
      });
      handleClose();
      openAlert({
        type: "alert",
        message:
          "パスワードが変更されました。変更されたパスワードでログインしてください。",
      });
    } catch (err) {
      // 410 = 토큰 만료·소비. 같은 화면에서 재시도해도 계속 실패하므로 1단계로 되돌린다.
      if (isAxiosError(err) && err.response?.status === 410) {
        alertError(err, SEKO_RESTART_MESSAGE);
        backToSekoIdentify();
        return;
      }
      alertError(err, "サーバーエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!isFormValid(activeTab, formData, sekoStep) || isSubmitting) return;

    // 시공점은 메일 링크를 거치지 않는 별도 흐름이다(화면설계서 v1.4 p12) — 아래 request 경로는
    // 판매점·일반 전용이며, 서버 스키마도 SEKO 를 거부한다.
    if (activeTab === "installer") {
      await (sekoStep === "identify" ? handleSekoIdentify() : handleSekoReset());
      return;
    }

    const userTp = TAB_TO_USERTP[activeTab];
    // Redmine #2156 — userTp 별 입력 정책:
    //   dealer (STORE)    : loginId + email 둘 다 전송 (서버에서 사후 매칭)
    //   general (GENERAL) : 단일 입력값을 loginId 필드로 전송 (서버가 dual-key 로 OR 매칭)
    const payload: Record<string, string> = { userTp };

    switch (activeTab) {
      case "dealer":
        payload.loginId = formData.id;
        payload.email = formData.email;
        break;
      case "general":
        payload.loginId = formData.idEmail;
        break;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/password-reset/request", payload);

      handleClose();
      openAlert({
        type: "alert",
        message: "パスワード変更リンクがメールで送信されました。",
      });
    } catch (err) {
      console.error("[PasswordResetPopup] パスワード初期化リクエスト失敗:", err);
      if (isAxiosError(err) && err.response) {
        const data = err.response.data as Record<string, unknown> | undefined;
        const errMsg = typeof data?.error === "string"
          ? data.error
          : "サーバーエラーが発生しました。";
        openAlert({ type: "alert", message: errMsg });
      } else {
        openAlert({
          type: "alert",
          message: "サーバーに接続できません。しばらくしてからもう一度お試しください。",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150 hover:border-[#D1D1D1] focus:border-[#101010]";
  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onClick={handleClose}
    >
      <div
        className="popup-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="パスワードの初期化"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            パスワードの初期化
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#E97923] cursor-pointer"
            aria-label="閉じる"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M1 1L9 9M9 1L1 9"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-6 lg:gap-[30px] w-full">
          {/* 안내 문구 */}
          <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-medium leading-[1.5] text-[#101010] w-full">
            {activeTab === "installer"
              ? sekoStep === "identify"
                ? "パスワードを初期化する施工IDを入力してください"
                : "新しいパスワードを入力してください"
              : "パスワードを初期化するIDとEメールアドレスを入力してください"}
          </p>

          {/* 폼 필드 */}
          <div className="flex flex-col gap-4 w-full">
            {/* 회원타입 (Read Only) */}
            <div className="flex flex-col gap-2 w-full">
              <label className={labelClass}>
                会員タイプ
                <span className="text-[#FF1A1A]">*</span>
              </label>
              <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                  {MEMBER_TYPES.find((t) => t.key === activeTab)?.label}
                </span>
              </div>
            </div>
            {activeTab === "dealer" && (
              <>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    ID<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => handleChange("id", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    E-Mail<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {/* 시공점 1단계 — 시공ID 입력 (p12 ②). 로그인은 메일·시공ID 겸용이지만 초기화는 시공ID 단독이다. */}
            {activeTab === "installer" && sekoStep === "identify" && (
              <div className="flex flex-col gap-2 w-full">
                <label className={labelClass}>
                  施工ID<span className="text-[#FF1A1A]">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="施工IDを入力してください"
                  value={formData.sekoId}
                  onChange={(e) => handleChange("sekoId", e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            {/* 시공점 2단계 — 비밀번호 설정 (p12 우측 팝업 ⑤·⑥). 1단계 식별자는 마스킹 표시만. */}
            {activeTab === "installer" && sekoStep === "set-password" && (
              <>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>施工ID</label>
                  <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                      {maskSekoId(formData.sekoId)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    新しいパスワード<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={formData.newPassword}
                    onChange={(e) => handleChange("newPassword", e.target.value)}
                    className={inputClass}
                  />
                  <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#0068B7]">
                    ※ 英大文字・英小文字・数字を組み合わせて8文字以上で設定
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    新しいパスワード再入力<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange("confirmPassword", e.target.value)}
                    className={inputClass}
                  />
                  {/*
                    불일치는 저장 버튼 비활성 사유이므로 이유를 화면에 남긴다 —
                    문구 없이 비활성만 하면 사용자가 원인을 알 수 없다.
                    정책 위반은 위 입력의 안내(※ 英大文字…)가 같은 역할을 한다.
                  */}
                  {formData.confirmPassword !== "" &&
                    formData.newPassword !== formData.confirmPassword && (
                      <p className="font-['Noto_Sans_JP'] text-[12px] leading-[1.5] text-[#FF1A1A]">
                        パスワードが一致しません
                      </p>
                    )}
                </div>
              </>
            )}

            {activeTab === "general" && (
              <div className="flex flex-col gap-2 w-full">
                <label className={labelClass}>
                  ID または E-Mail<span className="text-[#FF1A1A]">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={formData.idEmail}
                  onChange={(e) => handleChange("idEmail", e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* 버튼 */}
          <div className="popup-buttons">
            <Button variant="secondary" onClick={handleClose}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={() => { void handleSubmit(); }}
              disabled={isSubmitting || !isFormValid(activeTab, formData, sekoStep)}
            >
              {isSubmitting
                ? "送信中…"
                : activeTab === "installer" && sekoStep === "set-password"
                  ? "保存"
                  : "パスワードの初期化"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
