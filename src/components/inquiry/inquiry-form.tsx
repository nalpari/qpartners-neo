"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, InputBox, SelectBox } from "@/components/common";

const INQUIRY_TYPE_OPTIONS = [
  { label: "サービスに関するお問い合わせ", value: "service" },
  { label: "技術的なお問い合わせ", value: "technical" },
  { label: "その他", value: "other" },
];

// 더미 사용자 데이터 (추후 인증 연동)
const DUMMY_USER = {
  companyName: "INTERPLUG TEST",
  name: "金志映",
  phone: "03-5441-5943",
  email: "kjy0501@interplug.co.kr",
};

export function InquiryForm() {
  const isLoggedIn = true;

  const [companyName, setCompanyName] = useState(
    isLoggedIn ? DUMMY_USER.companyName : ""
  );
  const [name, setName] = useState(isLoggedIn ? DUMMY_USER.name : "");
  const [phone, setPhone] = useState(isLoggedIn ? DUMMY_USER.phone : "");
  const [email, setEmail] = useState(isLoggedIn ? DUMMY_USER.email : "");
  const [inquiryType, setInquiryType] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleCancel = () => {
    if (isLoggedIn) {
      setEmail(DUMMY_USER.email);
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
    if (!isLoggedIn) {
      if (!companyName.trim()) {
        alert("会社名を入力してください。");
        return;
      }
      if (!name.trim()) {
        alert("氏名を入力してください。");
        return;
      }
      if (!phone.trim()) {
        alert("電話番号を入力してください。");
        return;
      }
    }
    if (!email.trim()) {
      alert("メールアドレスを入力してください。");
      return;
    }
    if (!inquiryType) {
      alert("お問い合わせタイプを選択してください。");
      return;
    }
    if (!title.trim()) {
      alert("タイトルを入力してください。");
      return;
    }
    if (!content.trim()) {
      alert("内容を入力してください。");
      return;
    }

    alert(
      "お問い合わせが受け付けられました。\n内容確認後、担当者よりご連絡差し上げます。"
    );
    handleCancel();
  };

  return (
    <main className="flex flex-col items-center w-full lg:pb-[48px] pb-[28px] mt-[10px] lg:mt-0">
      {/* PC 카드 */}
      <div className="hidden lg:flex flex-col gap-[24px] w-[1440px]">
        <div className="bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px]">
          {/* 사용자 정보 — 2열 테이블 */}
          <div className="flex flex-col gap-[4px]">
            {/* Row 1: 회사명 / 성명 */}
            <div className="flex gap-[4px]">
              <div className="flex flex-1 gap-[4px] h-[58px] items-center">
                <div className="flex items-center w-[160px] h-full bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
                    会社名
                  </span>
                </div>
                {isLoggedIn ? (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] pl-[24px] pr-[8px] py-[8px]">
                    <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                      {companyName}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] p-[8px]">
                    <InputBox
                      value={companyName}
                      onChange={setCompanyName}
                      placeholder="会社名を入力"
                      className="border-[#ebebeb] h-[42px]"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-1 gap-[4px] h-[58px] items-center">
                <div className="flex items-center w-[160px] h-full bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
                    氏名
                  </span>
                </div>
                {isLoggedIn ? (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] pl-[24px] pr-[8px] py-[8px]">
                    <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                      {name}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] p-[8px]">
                    <InputBox
                      value={name}
                      onChange={setName}
                      placeholder="氏名を入力"
                      className="border-[#ebebeb] h-[42px]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: 전화번호 / 메일주소 */}
            <div className="flex gap-[4px]">
              <div className="flex flex-1 gap-[4px] h-[58px] items-center">
                <div className="flex items-center w-[160px] h-full bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
                    電話番号
                  </span>
                </div>
                {isLoggedIn ? (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] pl-[24px] pr-[8px] py-[8px]">
                    <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                      {phone}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] p-[8px]">
                    <InputBox
                      value={phone}
                      onChange={setPhone}
                      type="tel"
                      placeholder="電話番号を入力"
                      className="border-[#ebebeb] h-[42px]"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-1 gap-[4px] h-[58px] items-center">
                <div className="flex items-center w-[160px] h-full bg-[#f7f9fb] border border-[#eaf0f6] rounded-[6px] pl-4 pr-2 py-2">
                  <span className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f] whitespace-nowrap">
                    メールアドレス
                  </span>
                </div>
                {isLoggedIn ? (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] pl-[24px] pr-[8px] py-[8px]">
                    <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010] truncate">
                      {email}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center h-full bg-white border border-[#eaf0f6] rounded-[6px] p-[8px]">
                    <InputBox
                      value={email}
                      onChange={setEmail}
                      type="email"
                      placeholder="メールアドレスを入力"
                      className="border-[#ebebeb] h-[42px]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 문의 폼 필드 */}
          <div className="flex flex-col gap-[18px] mt-[24px]">
            {/* 문의유형 */}
            <div className="flex flex-col gap-[8px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                お問い合わせタイプ
                <span className="text-[#ff1a1a]">*</span>
              </p>
              <SelectBox
                options={INQUIRY_TYPE_OPTIONS}
                value={inquiryType}
                onChange={setInquiryType}
                placeholder="お問い合わせタイプを選択"
              />
            </div>

            {/* 제목 */}
            <div className="flex flex-col gap-[8px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                タイトル
                <span className="text-[#ff1a1a]">*</span>
              </p>
              <InputBox
                value={title}
                onChange={setTitle}
                placeholder=""
              />
            </div>

            {/* 내용 */}
            <div className="flex flex-col gap-[8px]">
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
          </div>
        </div>

        {/* PC 버튼 영역 — 카드 바깥 우측 정렬 */}
        <div className="flex items-center justify-end gap-2 pb-[4px]">
          <Button
            variant="secondary"
            className="w-[97px]"
            onClick={handleCancel}
          >
            キャンセル
          </Button>
          <Button
            variant="primary"
            className="w-[110px]"
            onClick={handleSubmit}
          >
            お問い合わせ
          </Button>
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="flex lg:hidden flex-col w-full">
        <div className="bg-white px-[24px] py-[34px]">
          <div className="flex flex-col">
            {/* 회사명 */}
            <div className="flex flex-col gap-[8px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                会社名
              </p>
              {isLoggedIn ? (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {companyName}
                </p>
              ) : (
                <InputBox
                  value={companyName}
                  onChange={setCompanyName}
                  placeholder="会社名を入力"
                />
              )}
            </div>

            {/* 성명 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                氏名
              </p>
              {isLoggedIn ? (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {name}
                </p>
              ) : (
                <InputBox
                  value={name}
                  onChange={setName}
                  placeholder="氏名を入力"
                />
              )}
            </div>

            {/* 전화번호 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                電話番号
              </p>
              {isLoggedIn ? (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {phone}
                </p>
              ) : (
                <InputBox
                  value={phone}
                  onChange={setPhone}
                  type="tel"
                  placeholder="電話番号を入力"
                />
              )}
            </div>

            {/* 메일주소 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                メールアドレス
              </p>
              {isLoggedIn ? (
                <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
                  {email}
                </p>
              ) : (
                <InputBox
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="メールアドレスを入力"
                />
              )}
            </div>

            {/* 문의유형 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                お問い合わせタイプ
                <span className="text-[#ff1a1a]">*</span>
              </p>
              <SelectBox
                options={INQUIRY_TYPE_OPTIONS}
                value={inquiryType}
                onChange={setInquiryType}
                placeholder="お問い合わせタイプを選択"
              />
            </div>

            {/* 제목 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
              <p className="font-['Noto_Sans_JP'] font-medium text-[14px] leading-[1.5] text-[#45576f]">
                タイトル
                <span className="text-[#ff1a1a]">*</span>
              </p>
              <InputBox
                value={title}
                onChange={setTitle}
                placeholder=""
              />
            </div>

            {/* 내용 */}
            <div className="flex flex-col gap-[8px] border-t border-[#eff4f8] pt-[18px] mt-[18px]">
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
          </div>
        </div>

        {/* 모바일 버튼 영역 */}
        <div className="flex items-center justify-center gap-[6px] px-[24px] pb-[28px] bg-white">
          <Button variant="secondary" className="flex-1" onClick={handleCancel}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            className="flex-1 shrink-0"
            onClick={handleSubmit}
          >
            お問い合わせ
          </Button>
        </div>
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
  );
}
