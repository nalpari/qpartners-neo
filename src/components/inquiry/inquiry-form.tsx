"use client";

import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, DimSpinner, InputBox, SelectBox } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { useMenuPermission } from "@/hooks/use-menu-permission";
import { MENU } from "@/lib/menu-codes";
import { sanitizePhoneInput } from "@/lib/format";
import type { LoginUser } from "@/lib/schemas/auth";
import api from "@/lib/axios";

interface CodeDetail {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

// 외부 컴포넌트: auth 캐시 구독 → user 변경 시 key로 내부 폼 리마운트
export function InquiryForm() {
  // useQuery로 캐시 구독 — auth 상태 변경 시 리렌더링 보장
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  return (
    <InquiryFormInner
      key={user ? `logged-${user.userId}` : "guest"}
      user={user}
    />
  );
}

/* ─── 사용자 정보 필드 (PC 테이블 행) ─── */
type InputType = "text" | "email" | "tel" | "password" | "number" | "url";

interface UserInfoField {
  label: string;
  value: string;
  input?: {
    value: string;
    onChange: (v: string) => void;
    type?: InputType;
    placeholder: string;
  };
}

function PcUserInfoRow({ fields }: { fields: [UserInfoField, UserInfoField] }) {
  return (
    <div className="flex gap-[4px]">
      {fields.map((field) => (
        <div key={field.label} className="flex flex-1 gap-[4px] h-[58px] items-center">
          <div className="flex items-center w-[160px] h-full bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] pl-4 pr-2 py-2">
            <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
              {field.label}
              {/* Issue #2170 — 미로그인(입력 가능) 시 필수 별표 표시. 로그인 readonly 케이스에는 표시 X. */}
              {field.input && <span className="text-[#ff1a1a]">*</span>}
            </span>
          </div>
          {field.input ? (
            <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] p-[8px]">
              <InputBox
                value={field.input.value}
                onChange={field.input.onChange}
                type={field.input.type}
                placeholder={field.input.placeholder}
                className="border-[#ebebeb] h-[42px]"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] pl-[24px] pr-[8px] py-[8px]">
              <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                {field.value}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MoUserInfoField({ field, isFirst }: { field: UserInfoField; isFirst?: boolean }) {
  return (
    <div className={`flex flex-col gap-[8px] ${isFirst ? "" : "border-t border-[#eff4f8] pt-[18px] mt-[18px]"}`}>
      <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
        {field.label}
        {/* Issue #2170 — 미로그인(입력 가능) 시 필수 별표 표시. 로그인 readonly 케이스에는 표시 X. */}
        {field.input && <span className="text-[#ff1a1a]">*</span>}
      </p>
      {field.input ? (
        <InputBox
          value={field.input.value}
          onChange={field.input.onChange}
          type={field.input.type}
          placeholder={field.input.placeholder}
        />
      ) : (
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
          {field.value}
        </p>
      )}
    </div>
  );
}

/* ─── 문의 폼 필드 (PC/MO 공통) ─── */
function InquiryFields({
  inquiryType,
  setInquiryType,
  inquiryTypeOptions,
  isCodeLoading,
  isCodeLoadError,
  title,
  setTitle,
  content,
  setContent,
  isMobile,
}: {
  inquiryType: string;
  setInquiryType: (v: string) => void;
  inquiryTypeOptions: { label: string; value: string }[];
  isCodeLoading: boolean;
  isCodeLoadError: boolean;
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  isMobile?: boolean;
}) {
  const separator = isMobile ? "border-t border-[#eff4f8] pt-[18px] mt-[18px]" : "";

  return (
    <>
      <div className={`flex flex-col gap-[8px] ${separator}`}>
        <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
          お問い合わせタイプ
          <span className="text-[#ff1a1a]">*</span>
        </p>
        <SelectBox
          options={inquiryTypeOptions}
          value={inquiryType}
          onChange={setInquiryType}
          placeholder={isCodeLoading ? "読み込み中..." : "お問い合わせタイプを選択"}
          disabled={isCodeLoading}
        />
        {isCodeLoadError && (
          <p className="font-['Noto_Sans_JP'] text-[12px] text-[#ff1a1a]">
            お問い合わせタイプの読み込みに失敗しました。ページを再読み込みしてください。
          </p>
        )}
      </div>

      <div className={`flex flex-col gap-[8px] ${separator}`}>
        <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
          タイトル
          <span className="text-[#ff1a1a]">*</span>
        </p>
        <InputBox value={title} onChange={setTitle} placeholder="" />
      </div>

      <div className={`flex flex-col gap-[8px] ${separator}`}>
        <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
          内容
          <span className="text-[#ff1a1a]">*</span>
        </p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-[300px] bg-white border border-[#ebebeb] rounded-[4px] p-[16px] resize-none outline-none font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] placeholder:text-[#AAAAAA] focus:border-[#101010] transition-colors duration-150"
        />
      </div>
    </>
  );
}

/* ─── 액션 버튼 ─── */
function ActionButtons({
  onCancel,
  onSubmit,
  isPending,
  isMobile,
  showSubmit,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
  isMobile?: boolean;
  /** RBAC 패턴 A — false 면 「お問い合わせ」 버튼 미노출. #2183 note-12 통일 */
  showSubmit: boolean;
}) {
  return (
    <div className={
      isMobile
        ? "flex items-center justify-center gap-[6px] px-[24px] pb-[28px] bg-white"
        : "flex items-center justify-end gap-2 pb-[4px]"
    }>
      <Button
        variant="secondary"
        className={isMobile ? "flex-1" : "w-[97px]"}
        onClick={onCancel}
      >
        キャンセル
      </Button>
      {showSubmit && (
        <Button
          variant="primary"
          className={isMobile ? "flex-1 shrink-0" : "w-[110px]"}
          onClick={onSubmit}
          disabled={isPending}
        >
          {isPending ? "送信中..." : "お問い合わせ"}
        </Button>
      )}
    </div>
  );
}

/* ─── 메인 폼 ─── */
function InquiryFormInner({ user }: { user: LoginUser | null }) {
  const { openAlert } = useAlertStore();
  const isLoggedIn = !!user;

  // RBAC — 비회원은 PUBLIC 통과, 로그인 사용자만 INQUIRY.canCreate 매트릭스 적용.
  // 비로그인 시 useMenuPermission 은 enabled=false 라 canCreate=false 반환 → isLoggedIn 분기로
  // 비회원 가드 우회. 서버 POST /api/inquiry 가 최종 방어선이라 FE 는 UX 알림 전용.
  const { canCreate: canCreateInquiry, isLoading: isPermLoading } = useMenuPermission(MENU.INQUIRY);
  // #2183 note-12 통일: RBAC 패턴 A (canCreate=false 인 로그인 사용자는 「お問い合わせ」 버튼 미노출).
  // 비회원은 PUBLIC 통과이므로 항상 노출. 로딩 중에는 미노출 (fail-closed) — race 클릭 차단.
  const canSubmitInquiry = !isLoggedIn || (!isPermLoading && canCreateInquiry);

  const {
    data: inquiryTypeOptions = [],
    isPending: isCodeLoading,
    isError: isCodeLoadError,
  } = useQuery({
    queryKey: ["codes", "INQUIRY_TYPE"],
    queryFn: async () => {
      const res = await api.get<{ data: CodeDetail[] }>("/codes/lookup", {
        params: { headerCode: "INQUIRY_TYPE" },
      });
      const details = res.data?.data;
      if (!Array.isArray(details)) {
        throw new Error("Unexpected response shape from /codes/lookup");
      }
      return details.map((d) => ({
        label: d.codeName,
        value: d.code,
      }));
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const [companyName, setCompanyName] = useState(user?.compNm ?? "");
  const [name, setName] = useState(user?.userNm ?? "");
  const [phone, setPhone] = useState(user?.telNo ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [inquiryType, setInquiryType] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const submitMutation = useMutation({
    mutationFn: async (data: {
      companyName: string;
      userName: string;
      tel?: string;
      email: string;
      inquiryType?: string;
      title: string;
      content: string;
    }) => {
      const res = await api.post<{ data: { id: number } }>("/inquiry", data);
      return res.data.data;
    },
    onSuccess: () => {
      openAlert({
        type: "alert",
        message: "お問い合わせが受け付けられました。\nご入力いただいたメールアドレスに確認メールをお送りしました。\n内容確認後、担当者よりご連絡差し上げます。",
      });
      handleCancel();
    },
    onError: (error: unknown) => {
      console.error("[InquiryForm] 문의 등록 실패:", error);

      if (isAxiosError<{ error?: string }>(error) && error.response) {
        const { status, data } = error.response;
        if (status === 400) {
          openAlert({ type: "alert", message: data?.error ?? "入力内容に不備があります。内容をご確認ください。" });
        } else if (status === 429) {
          openAlert({ type: "alert", message: data?.error ?? "リクエストが多すぎます。しばらく経ってから再度お試しください。" });
        } else {
          openAlert({ type: "alert", message: "お問い合わせの送信に失敗しました。\nしばらく経ってから再度お試しください。" });
        }
      } else {
        openAlert({ type: "alert", message: "お問い合わせの送信に失敗しました。\nしばらく経ってから再度お試しください。" });
      }
    },
  });

  const handleCancel = () => {
    if (isLoggedIn) {
      setCompanyName(user?.compNm ?? "");
      setName(user?.userNm ?? "");
      setPhone(user?.telNo ?? "");
      setEmail(user?.email ?? "");
    } else {
      setCompanyName("");
      setName("");
      setPhone("");
      setEmail("");
    }
    setInquiryType("");
    setTitle("");
    setContent("");
  };

  const handleSubmit = () => {
    // RBAC — 로그인 사용자에 한해 INQUIRY.canCreate 매트릭스 검증.
    // 권한 응답 도착 전 alert 노출 방지를 위해 로딩 중에는 silent return.
    if (isLoggedIn && isPermLoading) return;
    if (isLoggedIn && !canCreateInquiry) {
      openAlert({ type: "alert", message: "権限がありません。" });
      return;
    }

    if (!isLoggedIn) {
      if (!companyName.trim()) {
        openAlert({ type: "alert", message: "会社名を入力してください。" });
        return;
      }
      if (!name.trim()) {
        openAlert({ type: "alert", message: "氏名を入力してください。" });
        return;
      }
      if (!phone.trim()) {
        openAlert({ type: "alert", message: "電話番号を入力してください。" });
        return;
      }
    }
    if (!email.trim()) {
      openAlert({ type: "alert", message: "メールアドレスを入力してください。" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      openAlert({ type: "alert", message: "有効なメールアドレスを入力してください。" });
      return;
    }
    if (!inquiryType) {
      openAlert({
        type: "alert",
        message: isCodeLoadError
          ? "お問い合わせタイプの読み込みに失敗しました。ページを再読み込みしてください。"
          : "お問い合わせタイプを選択してください。",
      });
      return;
    }
    if (!title.trim()) {
      openAlert({ type: "alert", message: "タイトルを入力してください。" });
      return;
    }
    if (!content.trim()) {
      openAlert({ type: "alert", message: "内容を入力してください。" });
      return;
    }

    if (submitMutation.isPending) return;

    submitMutation.mutate({
      companyName: companyName.trim(),
      userName: name.trim(),
      tel: phone.trim() || undefined,
      email: email.trim(),
      inquiryType: inquiryType || undefined,
      title: title.trim(),
      content: content.trim(),
    });
  };

  // 사용자 정보 필드 정의 (로그인 시 읽기전용, 비로그인 시 입력)
  const userFields: UserInfoField[] = [
    {
      label: "会社名",
      value: companyName,
      input: isLoggedIn ? undefined : { value: companyName, onChange: setCompanyName, placeholder: "会社名を入力" },
    },
    {
      label: "氏名",
      value: name,
      input: isLoggedIn ? undefined : { value: name, onChange: setName, placeholder: "氏名を入力" },
    },
    {
      label: "電話番号",
      value: phone || "-",
      input: isLoggedIn
        ? undefined
        : {
            value: phone,
            onChange: (v: string) => setPhone(sanitizePhoneInput(v)),
            type: "tel",
            placeholder: "000-0000-0000",
          },
    },
    {
      label: "メールアドレス",
      value: email,
      input: isLoggedIn ? undefined : { value: email, onChange: setEmail, type: "email", placeholder: "メールアドレスを入力" },
    },
  ];

  const inquiryFieldsProps = {
    inquiryType,
    setInquiryType,
    inquiryTypeOptions,
    isCodeLoading,
    isCodeLoadError,
    title,
    setTitle,
    content,
    setContent,
  };

  return (
    <>
      {submitMutation.isPending && <DimSpinner />}
      <main className="flex flex-col items-center w-full lg:pb-[48px] pb-[28px] mt-[10px] lg:mt-0">
      {/* PC 카드 */}
      <div className="hidden lg:flex flex-col gap-[24px] w-[1440px]">
        <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px]">
          <div className="flex flex-col gap-[4px]">
            <PcUserInfoRow fields={[userFields[0], userFields[1]]} />
            <PcUserInfoRow fields={[userFields[2], userFields[3]]} />
          </div>
          <div className="flex flex-col gap-[18px] mt-[24px]">
            <InquiryFields {...inquiryFieldsProps} />
          </div>
        </div>
        <ActionButtons onCancel={handleCancel} onSubmit={handleSubmit} isPending={submitMutation.isPending} showSubmit={canSubmitInquiry} />
      </div>

      {/* 모바일 카드 */}
      <div className="flex lg:hidden flex-col w-full">
        <div className="bg-white px-[24px] py-[34px]">
          <div className="flex flex-col">
            {userFields.map((field, idx) => (
              <MoUserInfoField key={field.label} field={field} isFirst={idx === 0} />
            ))}
            <InquiryFields {...inquiryFieldsProps} isMobile />
          </div>
        </div>
        <ActionButtons onCancel={handleCancel} onSubmit={handleSubmit} isPending={submitMutation.isPending} isMobile showSubmit={canSubmitInquiry} />
      </div>

      {/* 비로그인 전용: 로그인 유도 안내 */}
      {!isLoggedIn && (
        <div className="flex items-center justify-center gap-2 w-full max-w-[1440px] mt-[24px] px-[24px] lg:px-0">
          <p className="font-['Noto_Sans_JP'] text-[13px] leading-[1.5] text-[#101010]">
            ※ログイン後ご利用の場合、個人情報の入力は必要ありません。
          </p>
          <Link
            href="/login"
            transitionTypes={["fade"]}
            className="inline-flex items-center gap-1 font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-[#e97923] whitespace-nowrap"
          >
            ログイン
            <svg
              width="6"
              height="10"
              viewBox="0 0 6 10"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 9L5 5L1 1"
                stroke="#e97923"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      )}
      </main>
    </>
  );
}
