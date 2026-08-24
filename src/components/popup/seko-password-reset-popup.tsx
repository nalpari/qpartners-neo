"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { Button } from "@/components/common";
import { PasswordInput } from "@/components/popup/password-change-popup";

/**
 * 시공점(SEKO) 전용 비밀번호 초기화 팝업 — 시공ID 조회 → 즉시 비밀번호 설정 (2단계).
 *
 * `PasswordResetPopup`(판매점·일반) 에서 위임받아 마운트된다. 시공점만 흐름이 다른데
 * (이메일 토큰 단계 없음) 그 분기를 부모 안에서 키우면 탭 3개가 한 컴포넌트인 구조상
 * 판매점·일반 탭 회귀 위험이 커지므로 통째로 분리했다.
 *
 * 이메일 링크 방식을 쓰지 않는 이유는 AS-IS 제약이다 — 시공점은 커넥터 응답 어디에도
 * 이메일 필드가 없어 시공ID 로부터 수신 주소를 얻을 수 없다.
 */

const CLOSE_ANIMATION_MS = 200;

type Step = "lookup" | "set";

/**
 * 시공ID 표시용 마스킹 — `lib/interface-logger.ts` 의 `maskUserId`/`maskEmail` 과 **동일 규칙**.
 *   - 이메일 형태  : 앞 1자 + `***` + `@도메인`  (예: `c***@interplug.co.kr`)
 *   - 그 외 식별자 : 앞 2자 + `***`             (2자 이하는 전부 가림)
 *
 * 시공점 로그인은 「メール or 施工ID」를 모두 받으므로 두 형태가 다 들어온다.
 * 원본 헬퍼를 재사용하지 못하는 이유는 `interface-logger` 가 prisma 를 import 해
 * 클라이언트 번들에 들어갈 수 없기 때문이다 — 규칙이 갈리지 않도록 알고리즘을 맞춰 둔다.
 */
function maskSekoId(value: string): string {
  const atIdx = value.indexOf("@");
  if (atIdx > 0) return value[0] + "***" + value.slice(atIdx);
  return value.length <= 2 ? "***" : value.slice(0, 2) + "***";
}

/** 비밀번호 정책 — 서버 `validatePasswordPolicy` 와 동일 기준(영대문자+영소문자+숫자, 8자 이상). */
function isValidPassword(pwd: string): boolean {
  return (
    pwd.length >= 8
    && pwd.length <= 100
    && /[A-Z]/.test(pwd)
    && /[a-z]/.test(pwd)
    && /[0-9]/.test(pwd)
  );
}

export function SekoPasswordResetPopup() {
  const { closePopup } = usePopupStore();
  const { openAlert } = useAlertStore();

  const [step, setStep] = useState<Step>("lookup");
  const [sekoId, setSekoId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  /** 서버 에러를 사용자 문구로 변환. 서버가 사유를 내려주면 그대로 쓴다(모호화는 서버가 이미 수행). */
  const alertServerError = (err: unknown, fallback: string) => {
    if (isAxiosError(err) && err.response) {
      const data: unknown = err.response.data;
      const isObj = (v: unknown): v is Record<string, unknown> =>
        v != null && typeof v === "object";
      const errorField = isObj(data) && "error" in data ? data.error : undefined;
      const issues = isObj(data) && "issues" in data && Array.isArray(data.issues) ? data.issues : [];
      const first = issues[0];
      const firstMessage = isObj(first) && "message" in first ? String(first.message) : undefined;

      // Zod 필드 에러(비밀번호 정책 등)는 사용자가 고칠 수 있어야 하므로 필드 문구를 우선한다.
      if (errorField === "Validation failed" && firstMessage) {
        openAlert({ type: "alert", message: firstMessage });
        return;
      }
      openAlert({
        type: "alert",
        message: typeof errorField === "string" && errorField ? errorField : fallback,
      });
      return;
    }
    console.error("[SekoPasswordResetPopup] 요청 실패:", err);
    openAlert({
      type: "alert",
      message: "サーバーに接続できません。しばらくしてからもう一度お試しください。",
    });
  };

  /** 1단계 — 시공ID 존재 확인. 성공하면 비밀번호 설정 화면으로 즉시 전환한다. */
  const handleLookup = async () => {
    if (isSubmitting) return;
    if (sekoId.trim() === "") {
      setErrors({ sekoId: "施工IDを入力してください" });
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await api.post("/auth/seko/password-reset/check", { sekoId: sekoId.trim() });
      setStep("set");
    } catch (err: unknown) {
      // 서버가 문구를 내려주지 못한 경우(프록시 경유 등)의 폴백 — 서버 응답과 동일 문구.
      alertServerError(err, "一致する会員情報がありません。\n入力情報を再度ご確認ください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 2단계 — 신규 비밀번호 저장. */
  const handleSave = async () => {
    if (isSubmitting) return;

    const nextErrors: Record<string, string> = {};
    if (!newPassword) {
      nextErrors.new = "新規パスワードを入力してください";
    } else if (!isValidPassword(newPassword)) {
      // 조건 나열은 입력란 아래 안내문(※…)이 이미 하고 있어, 에러는 짧게 형식 불일치만 알린다.
      nextErrors.new = "パスワードの形式が正しくありません";
    }
    if (!confirmPassword) {
      nextErrors.confirm = "新規パスワードを再入力してください";
    } else if (newPassword && confirmPassword !== newPassword) {
      nextErrors.confirm = "新規パスワードが一致しません";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await api.post("/auth/seko/password-reset/confirm", {
        sekoId: sekoId.trim(),
        newPassword,
        confirmPassword,
      });
      setIsSubmitting(false);
      openAlert({
        type: "alert",
        message: "パスワードが変更されました。変更後のパスワードでログインしてください。",
        onConfirm: handleClose,
      });
    } catch (err: unknown) {
      setIsSubmitting(false);
      alertServerError(err, "サーバーエラーが発生しました。しばらくしてからお試しください。");
    }
  };

  const inputClass =
    "w-full h-[42px] px-4 bg-white border rounded-[4px] font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] outline-none transition-colors duration-150";
  const labelClass =
    "font-['Noto_Sans_JP'] text-[13px] lg:text-[14px] font-medium leading-[1.5] text-[#101010]";
  const errorClass = "font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#ff1a1a]";

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
            <p className="font-['Noto_Sans_JP'] text-[14px] lg:text-[15px] font-medium leading-[1.5] text-[#101010] w-full">
              {step === "lookup"
                ? "パスワードを初期化する施工IDを入力してください"
                : "新しいパスワードを入力してください"}
            </p>

            <div className="flex flex-col gap-4 w-full">
              {/* 회원타입 (Read Only) — 조회 단계에서 어느 탭으로 들어왔는지 확인시키는 용도라
                  비밀번호 설정 단계에서는 표시하지 않는다. */}
              {step === "lookup" && (
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    会員タイプ
                    <span className="text-[#FF1A1A]">*</span>
                  </label>
                  <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                    <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                      施工店会員
                    </span>
                  </div>
                </div>
              )}

              {step === "lookup" ? (
                <div className="flex flex-col gap-2 w-full">
                  <label className={labelClass}>
                    施工ID<span className="text-[#FF1A1A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={sekoId}
                    onChange={(e) => {
                      setSekoId(e.target.value);
                      setErrors({});
                    }}
                    className={`${inputClass} ${
                      errors.sekoId
                        ? "border-[#ff1a1a]"
                        : "border-[#EBEBEB] hover:border-[#D1D1D1] focus:border-[#101010]"
                    }`}
                  />
                  {errors.sekoId && <p className={errorClass}>{errors.sekoId}</p>}
                </div>
              ) : (
                <>
                  {/* 조회에 사용한 시공ID — 어떤 계정을 바꾸는지 화면에 남겨둔다 */}
                  <div className="flex flex-col gap-2 w-full">
                    <label className={labelClass}>施工ID</label>
                    <div className="flex items-center w-full h-[42px] px-4 bg-[#f5f5f5] border border-[#ebebeb] rounded-[4px]">
                      <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
                        {maskSekoId(sekoId.trim())}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <label className={labelClass}>
                      新規パスワード入力<span className="text-[#FF1A1A]">*</span>
                    </label>
                    <PasswordInput
                      value={newPassword}
                      onChange={(v) => {
                        setNewPassword(v);
                        setErrors((e) => ({ ...e, new: "" }));
                      }}
                      show={showNew}
                      onToggle={() => setShowNew((v) => !v)}
                      hasError={!!errors.new}
                    />
                    {errors.new ? (
                      <p className={errorClass}>{errors.new}</p>
                    ) : (
                      <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060b4]">
                        ※英大文字・英小文字・数字を組み合わせて8文字以上に設定
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <label className={labelClass}>
                      新規パスワード再入力<span className="text-[#FF1A1A]">*</span>
                    </label>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={(v) => {
                        setConfirmPassword(v);
                        setErrors((e) => ({ ...e, confirm: "" }));
                      }}
                      show={showConfirm}
                      onToggle={() => setShowConfirm((v) => !v)}
                      hasError={!!errors.confirm}
                    />
                    {errors.confirm && <p className={errorClass}>{errors.confirm}</p>}
                  </div>
                </>
              )}
            </div>

            {/* 버튼 */}
            <div className="popup-buttons">
              <Button variant="secondary" onClick={handleClose}>
                キャンセル
              </Button>
              {step === "lookup" ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    void handleLookup();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "確認中…" : "パスワードの初期化"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "保存中…" : "保存"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
