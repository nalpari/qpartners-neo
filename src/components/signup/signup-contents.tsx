"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { InputBox, Button, Checkbox, Radio } from "@/components/common";
import { Spinner } from "@/components/common/spinner";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

const EMAIL_CHECK_MESSAGES: Record<string, string> = {
  ok: "利用可能な電子メールです",
  duplicate: "既に使用中の電子メールです",
  invalid: "正しくない電子メールアドレスです",
  error: "メールチェック中にエラーが発生しました",
};

export function SignupContents() {
  const router = useRouter();

  // 폼 상태
  const [form, setForm] = useState({
    companyName: "",
    companyNameKana: "",
    postalCode: "",
    address1: "",
    address2: "",
    phone: "",
    fax: "",
    lastName: "",
    firstName: "",
    lastNameKana: "",
    firstNameKana: "",
    email: "",
    password: "",
    passwordConfirm: "",
    department: "",
    position: "",
    newsletter: true,
    agreeTerms: false,
  });

  // UI 상태
  const [emailCheckStatus, setEmailCheckStatus] = useState<
    "idle" | "ok" | "duplicate" | "invalid" | "error"
  >("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 폼 필드 업데이트 헬퍼
  const updateField = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "email") setEmailCheckStatus("idle");
  };

  // Design Ref: §5.1.7 — Zod 스키마의 validatePasswordPolicy 함수로 통일
  const isPasswordValid = validatePasswordPolicy(form.password);

  // 필수필드 입력 완료 여부 (파생 값)
  const isFormValid =
    form.companyName.trim() !== "" &&
    form.companyNameKana.trim() !== "" &&
    form.postalCode.trim() !== "" &&
    form.address1.trim() !== "" &&
    form.phone.trim() !== "" &&
    form.lastName.trim() !== "" &&
    form.firstName.trim() !== "" &&
    form.lastNameKana.trim() !== "" &&
    form.firstNameKana.trim() !== "" &&
    form.email.trim() !== "" &&
    emailCheckStatus === "ok" &&
    isPasswordValid &&
    form.password === form.passwordConfirm &&
    form.agreeTerms;

  // Design Ref: §5.1.5 — 이메일 중복체크 API 연동
  const handleEmailCheck = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setEmailCheckStatus("invalid");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/auth/email/check", { email: form.email });
      setEmailCheckStatus("ok");
    } catch (error) {
      console.error("[Signup] メール重複チェック失敗:", error);
      if (isAxiosError(error) && error.response?.status === 409) {
        setEmailCheckStatus("duplicate");
      } else {
        setEmailCheckStatus("error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Design Ref: §5.1.6 — 컨펌 다이얼로그 + 회원가입 API 연동
  const handleSubmit = () => {
    if (!isFormValid) return;

    openAlert({
      type: "confirm",
      message: "Q.PARTNERSの一般会員として登録しますか？",
      confirmLabel: "確認",
      cancelLabel: "キャンセル",
      onConfirm: submitSignup,
    });
  };

  const submitSignup = async () => {
    setIsLoading(true);
    setSubmitError(null);
    try {
      const res = await api.post<{ data: { userName: string; email: string } }>(
        "/auth/signup",
        {
          email: form.email,
          pwd: form.password,
          confirmPwd: form.passwordConfirm,
          user1stNm: form.firstName,
          user2ndNm: form.lastName,
          user1stNmKana: form.firstNameKana,
          user2ndNmKana: form.lastNameKana,
          compNm: form.companyName,
          compNmKana: form.companyNameKana,
          compPostCd: form.postalCode,
          compAddr: form.address1,
          compAddr2: form.address2,
          compTelNo: form.phone,
          compFaxNo: form.fax,
          deptNm: form.department,
          pstnNm: form.position,
          newsRcptYn: form.newsletter ? "Y" : "N",
        }
      );

      const { userName, email } = res.data.data;
      openPopup("signup-complete", { userName, userId: email });
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        const body: unknown = error.response.data;
        const msg =
          typeof body === "object" && body !== null && "error" in body && typeof (body as Record<string, unknown>).error === "string"
            ? ((body as Record<string, unknown>).error as string)
            : undefined;
        setSubmitError(msg ?? "会員登録に失敗しました");
      } else {
        setSubmitError("サーバーに接続できません");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 취소
  const handleCancel = () => {
    router.push("/login");
  };

  const { openPopup } = usePopupStore();
  const { openAlert } = useAlertStore();

  // 주소검색
  const handleAddressSearch = () => {
    openPopup("zipcode-search", {
      onSelect: (address: { zipcode: string; prefecture: string; city: string; town: string }) => {
        updateField("postalCode", address.zipcode);
        updateField("address1", `${address.prefecture}${address.city}${address.town}`);
      },
    });
  };

  return (
    <>
    {/* 로딩 오버레이 — Design Ref: §5.1.8, 로그인과 동일 패턴 */}
    {isLoading && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Spinner size={48} className="text-white" />
      </div>
    )}
    <div className="flex flex-col gap-[10px] lg:gap-6 items-center w-full pb-6 lg:pb-12 mt-[10px] lg:mt-0">
      <div className="flex flex-col gap-[10px] lg:gap-[18px] w-full max-w-[1440px]">
        {/* 상단 안내 카드 */}
        <HeaderCard />

        {/* 법인정보 섹션 */}
          <section className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden pt-[34px] pb-6 px-6">
            {/* 섹션 헤더 — MO에서 하단 보더 추가 */}
            <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010] pb-4 border-b border-[#EEE] lg:pb-0 lg:border-b-0">
              法人情報 <span className="text-[#FF1A1A]">(*必須)</span>
            </h2>

            {/* 폼 행들 */}
            <div className="flex flex-col gap-4 mt-4 lg:gap-[4px] lg:mt-4">
              {/* 회원유형 (Read Only) */}
              <FormRow label="会員タイプ">
                <p className="font-['Noto_Sans_JP'] text-sm text-[#101010] leading-[1.5] lg:pl-6">
                  一般会員
                </p>
              </FormRow>

              {/* 회사명 */}
              <FormRow label="会社名" required>
                <InputBox
                  value={form.companyName}
                  onChange={(v) => updateField("companyName", v)}
                />
              </FormRow>

              {/* 회사명 히라가나 */}
              <FormRow label="会社名ひらがな" required>
                <InputBox
                  value={form.companyNameKana}
                  onChange={(v) => updateField("companyNameKana", v)}
                />
              </FormRow>

              {/* 우편번호 + 주소검색 */}
              <FormRow label="郵便番号" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <InputBox
                    value={form.postalCode}
                    readOnly
                    disabled
                    className="w-full lg:w-[120px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddressSearch}
                    className="flex items-center justify-center h-[42px] w-full lg:w-[84px] shrink-0 bg-[#ECF4F9] border border-[#C0DFF4] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[13px] text-[#0E78C3] leading-[1.5] cursor-pointer"
                  >
                    住所検索
                  </button>
                  <p className="font-['Noto_Sans_JP'] text-sm text-[#1060B4] leading-[1.5] lg:flex lg:items-center lg:pl-2 lg:pr-[18px] lg:shrink-0">
                    ※住所検索ボタンをクリックして都道府県情報を選択してください
                  </p>
                </div>
              </FormRow>

              {/* 주소 */}
              <FormRow label="住所" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <InputBox
                    value={form.address1}
                    readOnly
                    disabled
                    className="lg:flex-1"
                  />
                  <InputBox
                    value={form.address2}
                    onChange={(v) => updateField("address2", v)}
                    className="lg:flex-1"
                  />
                </div>
              </FormRow>

              {/* 전화번호 */}
              <FormRow label="電話番号" required>
                <InputBox
                  value={form.phone}
                  onChange={(v) => updateField("phone", v)}
                  type="tel"
                />
              </FormRow>

              {/* FAX 번호 */}
              <FormRow label="FAX番号">
                <InputBox
                  value={form.fax}
                  onChange={(v) => updateField("fax", v)}
                  type="tel"
                />
              </FormRow>
            </div>
          </section>

          {/* 회원정보 섹션 */}
          <section className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden pt-[34px] pb-6 px-6">
            <h2 className="font-['Noto_Sans_JP'] font-medium text-[15px] text-[#101010] pb-4 border-b border-[#EEE] lg:pb-0 lg:border-b-0">
              会員情報 <span className="text-[#FF1A1A]">(*必須)</span>
            </h2>

            <div className="flex flex-col gap-4 mt-4 lg:gap-[4px] lg:mt-4">
              {/* 성명 (2칸) */}
              <FormRow label="氏名" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <InputBox
                    value={form.lastName}
                    onChange={(v) => updateField("lastName", v)}
                    placeholder="姓"
                    className="w-full lg:w-[120px]"
                  />
                  <InputBox
                    value={form.firstName}
                    onChange={(v) => updateField("firstName", v)}
                    placeholder="名前"
                    className="lg:flex-1"
                  />
                </div>
              </FormRow>

              {/* 성명 히라가나 (2칸) */}
              <FormRow label="氏名ひらがな" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <InputBox
                    value={form.lastNameKana}
                    onChange={(v) => updateField("lastNameKana", v)}
                    placeholder="姓"
                    className="w-full lg:w-[120px]"
                  />
                  <InputBox
                    value={form.firstNameKana}
                    onChange={(v) => updateField("firstNameKana", v)}
                    placeholder="名前"
                    className="lg:flex-1"
                  />
                </div>
              </FormRow>

              {/* 이메일 (ID) + 중복체크 */}
              <FormRow label="メール (ID)" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <InputBox
                    value={form.email}
                    onChange={(v) => updateField("email", v)}
                    type="email"
                    className="w-full lg:w-[602px]"
                  />
                  <button
                    type="button"
                    onClick={handleEmailCheck}
                    className="flex items-center justify-center h-[42px] w-full lg:w-[110px] shrink-0 bg-[#ECF4F9] border border-[#C0DFF4] rounded-[4px] font-['Noto_Sans_JP'] font-medium text-[13px] text-[#0E78C3] leading-[1.5] cursor-pointer"
                  >
                    重複チェック
                  </button>
                  {emailCheckStatus !== "idle" && (
                    <p className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] lg:flex lg:items-center lg:pl-[8px] lg:pr-[18px] lg:shrink-0 ${emailCheckStatus === "ok" ? "text-[#1060B4]" : "text-[#FF1A1A]"}`}>
                      {EMAIL_CHECK_MESSAGES[emailCheckStatus]}
                    </p>
                  )}
                </div>
              </FormRow>

              {/* 비밀번호 + 눈 토글 */}
              <FormRow label="パスワード" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <PasswordInput
                    value={form.password}
                    onChange={(v) => updateField("password", v)}
                    show={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                  />
                  <p className="font-['Noto_Sans_JP'] text-sm text-[#1060B4] leading-[1.5] lg:flex lg:items-center lg:pl-2 lg:pr-[18px] lg:shrink-0">
                    ※英語/数字/記号のうち2つ以上を組み合わせて8文字以上に設定
                  </p>
                </div>
              </FormRow>

              {/* 비밀번호 재입력 + 눈 토글 */}
              <FormRow label="パスワード再入力" required>
                <div className="flex flex-col lg:flex-row gap-2 w-full">
                  <PasswordInput
                    value={form.passwordConfirm}
                    onChange={(v) => updateField("passwordConfirm", v)}
                    show={showPasswordConfirm}
                    onToggle={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  />
                  {/* 비밀번호 행과 너비 맞춤용 빈 영역 */}
                  <span className="hidden lg:flex lg:items-center lg:pl-2 lg:pr-[18px] lg:shrink-0 lg:invisible font-['Noto_Sans_JP'] text-sm leading-[1.5]">
                    ※英語/数字/記号のうち2つ以上を組み合わせて8文字以上に設定
                  </span>
                </div>
              </FormRow>

              {/* 부서명 */}
              <FormRow label="部署名">
                <InputBox
                  value={form.department}
                  onChange={(v) => updateField("department", v)}
                />
              </FormRow>

              {/* 직책 */}
              <FormRow label="役職">
                <InputBox
                  value={form.position}
                  onChange={(v) => updateField("position", v)}
                />
              </FormRow>

              {/* 뉴스레터 수신 */}
              <FormRow label="ニュースレターの受信" required>
                <div className="flex items-center gap-[12px] lg:px-[16px]">
                  <Radio
                    checked={form.newsletter}
                    onChange={() => updateField("newsletter", true)}
                    label="許可"
                    name="newsletter"
                  />
                  <Radio
                    checked={!form.newsletter}
                    onChange={() => updateField("newsletter", false)}
                    label="拒否"
                    name="newsletter"
                  />
                </div>
              </FormRow>
            </div>

            {/* 에러 메시지 — Design Ref: §5.1.9 */}
            {submitError && (
              <p className="font-['Noto_Sans_JP'] text-[14px] text-[#FF1A1A] leading-[1.5] text-center pt-4">
                {submitError}
              </p>
            )}

            {/* MO 하단: 이용약관 + 버튼 (회원정보 카드 내부) */}
            <div className="flex flex-col gap-[18px] items-center w-full pt-6 lg:hidden">
              <div className="flex items-center justify-center gap-2 w-full">
                <Checkbox
                  checked={form.agreeTerms}
                  onChange={(checked) => updateField("agreeTerms", checked)}
                  label="利用規約の同意 (必須)"
                />
                <button
                  type="button"
                  onClick={() => openPopup("terms")}
                  className="font-['Noto_Sans_JP'] font-medium text-sm text-[#0051FF] underline cursor-pointer shrink-0"
                >
                  見る
                </button>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="secondary" onClick={handleCancel} fullWidth>
                  キャンセル
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={!isFormValid}
                  fullWidth
                >
                  会員登録
                </Button>
              </div>
            </div>
          </section>
      </div>

      {/* PC 하단: 이용약관 + 버튼 (카드 밖, 회색 배경 위) */}
      <div className="hidden lg:flex items-center justify-between w-full max-w-[1440px] pb-1">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.agreeTerms}
            onChange={(checked) => updateField("agreeTerms", checked)}
            label="利用規約の同意 (必須)"
          />
          <button
            type="button"
            onClick={() => openPopup("terms")}
            className="font-['Noto_Sans_JP'] font-medium text-sm text-[#0051FF] underline cursor-pointer shrink-0"
          >
            見る
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleCancel} className="w-[97px]">
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="w-[84px]"
          >
            会員登録
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}

/* ─── 내부 컴포넌트 ─── */

/** PC: 테이블 행 (Th + Form) / MO: 세로 스택 (라벨 + 입력) */
function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* PC 테이블 행 — gap-[4px] 개별 행 스타일 */}
      <div className="hidden lg:flex h-[58px] items-center gap-[4px]">
        <div className="w-[200px] h-full shrink-0 bg-[#F7F9FB] border border-[#EAF0F6] rounded-[6px] flex items-center pl-[16px] pr-[8px] py-[8px]">
          <span className="font-['Noto_Sans_JP'] font-medium text-[14px] text-[#45576F] overflow-hidden text-ellipsis whitespace-nowrap">
            {label}
            {required && <span className="text-[#FF1A1A]">*</span>}
          </span>
        </div>
        <div className="flex-1 h-full border border-[#EAF0F6] rounded-[6px] flex items-center gap-[8px] p-[8px]">
          {children}
        </div>
      </div>

      {/* MO 세로 스택 */}
      <div className="flex flex-col gap-2 lg:hidden">
        <span className="font-['Noto_Sans_JP'] font-medium text-sm text-[#45576F] overflow-hidden text-ellipsis whitespace-nowrap">
          {label}
          {required && <span className="text-[#FF1A1A]">*</span>}
        </span>
        {children}
      </div>
    </>
  );
}

/** 비밀번호 입력 필드 (눈 토글 포함) */
function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 w-full lg:flex-1 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] overflow-hidden transition-colors duration-150 hover:border-[#D1D1D1] focus-within:border-[#101010]">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none text-[#101010] placeholder:text-[#AAAAAA]"
      />
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 flex items-center justify-center cursor-pointer"
        aria-label={show ? "パスワードを非表示" : "パスワードを表示"}
      >
        <Image
          src={
            show
              ? "/asset/images/contents/default_eye_show.svg"
              : "/asset/images/contents/default_eye_hide.svg"
          }
          alt=""
          width={20}
          height={14}
        />
      </button>
    </div>
  );
}

/** 상단 안내 카드 */
function HeaderCard() {
  return (
    <div className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden px-6 lg:px-5 py-[34px] lg:py-2">
      {/* PC: 가로 배치 */}
      <div className="hidden lg:flex items-center h-[60px]">
        <p className="flex-1 font-['Noto_Sans_JP'] text-sm text-[#101010] leading-[1.5]">
          ※本画面は一般会員登録のためのページです.
          販売店会員および施工店会員は各会員タイプボタンをクリックして該当加入ページに移動してください.
        </p>
        <div className="flex gap-2 shrink-0">
          <ExternalLinkButton href="https://www.hanasys.jp/join">
            販売店会員登録
          </ExternalLinkButton>
          <ExternalLinkButton href="https://q-partners.q-cells.jp/seminar/">
            施工店会員登録
          </ExternalLinkButton>
        </div>
      </div>

      {/* MO: 세로 배치 */}
      <div className="flex flex-col gap-6 lg:hidden">
        <p className="font-['Noto_Sans_JP'] text-sm text-[#101010] leading-[1.5]">
          ※本画面は一般会員登録のためのページです.
          販売店会員および施工店会員は各会員タイプボタンをクリックして該当加入ページに移動してください.
        </p>
        <div className="flex gap-2 w-full">
          <ExternalLinkButton
            href="https://www.hanasys.jp/join"
            className="flex-1"
          >
            販売店会員登録
          </ExternalLinkButton>
          <ExternalLinkButton
            href="https://q-partners.q-cells.jp/seminar/"
            className="flex-1"
          >
            施工店会員登録
          </ExternalLinkButton>
        </div>
      </div>
    </div>
  );
}

/** 외부 링크 버튼 (판매점/시공점 회원가입) */
function ExternalLinkButton({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center h-[42px] w-[123px] bg-[#EFA48D] border border-[#E3957D] rounded-[4px] shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] font-['Noto_Sans_JP'] font-medium text-[13px] text-white text-center leading-[1.5] ${className}`}
    >
      {children}
    </a>
  );
}
