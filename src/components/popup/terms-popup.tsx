"use client";

import { useState } from "react";
import { usePopupStore } from "@/lib/store";
import { Button } from "@/components/common";

const CLOSE_ANIMATION_MS = 200;

export function TermsPopup() {
  const { closePopup } = usePopupStore();
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleClose();
  };

  return (
    <div
      className={`popup-overlay ${isClosing ? "popup-overlay--closing" : ""}`}
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="popup-container w-[339px] lg:w-[720px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="利用規約"
      >
        <div className="popup-container__inner">
          {/* タイトル */}
          <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
            <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
              Q.PARTNERS 利用規約
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#E97923] cursor-pointer"
              aria-label="閉じる"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 本文 */}
          <div className="flex flex-col w-full">
            <div className="flex flex-col gap-[24px] lg:gap-[30px] w-full">
              {/* 스크롤 영역 */}
              <div className="overflow-y-auto max-h-[50vh] lg:max-h-[55vh] pr-[4px] font-['Noto_Sans_JP'] text-[13px] text-[#333] leading-[1.8] flex flex-col gap-[20px]">
                <p className="text-[14px] text-[#101010]">
                  ハンファジャパン株式会社が提供するWebサイトサービス「Q.PARTNERS」は、住宅・建築の専門家向けに太陽光商品情報を提供しています。本規約に同意し遵守してご利用ください。
                </p>

                <Section title="第１条（本規約の適用範囲及び本規約への同意）">
                  本規約は、ユーザーが本ウェブサイト上の全サービスを利用する際に適用されます。利用登録を完了した時点で、本規約の内容全てに同意したものとみなします。
                </Section>

                <Section title="第２条（ユーザーの定義）">
                  「ユーザー」は以下のいずれかに該当する者を指します。{"\n"}
                  ・利用登録を完了し当社から承認された者{"\n"}
                  ・ユーザーが第三者の代わりに登録申請し承認された者{"\n"}
                  ・Q.CASTのログインID取得者{"\n"}
                  ・当社の施工ID取得者
                </Section>

                <Section title="第３条（利用登録およびユーザーの登録情報）">
                  登録希望者が当社の定める方法によって利用登録を申請し、当社がこれを承認することによって、利用登録が完了します。虚偽の申告は認められず、発覚時は登録抹消が可能です。
                </Section>

                <Section title="第４条（ユーザーIDおよびパスワードの管理）">
                  ユーザーは自己責任でID・パスワードを管理し、第三者への譲渡は禁止されます。当社は、ユーザーの下でのユーザーIDとパスワードの使用上の過失に対し責任を負いません。
                </Section>

                <Section title="第５条（目的外の利用禁止など）">
                  本ウェブサイトに掲載されている、または、本ウェブサイトを介して他のウェブサイトからダウンロードできるコンテンツの著作権は当社またはライセンサーに帰属します。営利目的の使用および太陽光商品設置提案業務の範囲を超えた利用は禁止です。
                </Section>

                <Section title="第６条（秘密保持に関して）">
                  ウェブサイトの営業秘密・技術情報について、善良なる管理者の注意義務をもって各種コンテンツを利用するものとします。
                </Section>

                <Section title="第７条（利用料金および支払い方法）">
                  ユーザーは、本サービス内で発生した費用に関しては、当社が別途定め、本ウェブサイトに表示する料金を、当社が指定する方法により支払うものとします。
                </Section>

                <Section title="第８条（禁止事項）">
                  以下の行為は禁止されます。{"\n"}
                  ・法令・公序良俗違反{"\n"}
                  ・犯罪関連行為{"\n"}
                  ・第三者の権利侵害{"\n"}
                  ・サーバー破壊・妨害{"\n"}
                  ・運営妨害{"\n"}
                  ・個人情報収集{"\n"}
                  ・なりすまし{"\n"}
                  ・反社会的勢力への利益供与{"\n"}
                  ・その他不適切な行為
                </Section>

                <Section title="第９条（本サービスの提供の停止等）">
                  当社は事前に告知することなく本サービスの全部もしくは一部の提供を停止または中断することができる場合があります。停止による損害に対し責任を負いません。
                </Section>

                <Section title="第１０条（ユーザーの退会、利用制限、登録抹消及び責任）">
                  当社が定める所定の手続きに従い退会できます。規約違反時は事前通知なく利用制限・登録抹消が可能です。
                </Section>

                <Section title="第１１条（免責事項）">
                  当社は、障害または本サービスの使用不能を含め、ユーザーの下で生じたユーザーのいかなる損害に責任を負いません。コンテンツの正確性等について法的保証はなく、他ユーザーとの紛争にも責任を負いません。
                </Section>

                <Section title="第１２条（本サービスの変更、中止等）">
                  当社は、ユーザーに事前に通知することなく、本サービスの内容を変更し、または本サービスの提供を任意に中止することができるものとします。
                </Section>

                <Section title="第１３条（利用規約の変更）">
                  当社はユーザーに通知することなくいつでも本規約を変更することができ、変更内容を掲載時点で全ユーザーが同意したものとみなされます。
                </Section>

                <Section title="第１４条（通知または連絡）">
                  当社の定める方法で行われます。
                </Section>

                <Section title="第１５条（権利義務の譲渡の禁止）">
                  ユーザーは、当社の書面による事前の承諾なく、本規約上の地位または本規約に基づく権利もしくは義務を第三者に譲渡できません。
                </Section>

                <Section title="第１６条（準拠法・裁判管轄）">
                  日本国内法に準拠し、紛争時は東京地方裁判所が第一審の専属的合意管轄裁判所となります。
                </Section>

                <Section title="第１７条（個人情報等に関して）">
                  個人情報収集目的：利用者特定、情報提供、物品発送、ウェブサイト運営等。当社は利用目的の達成に必要な範囲内において、ユーザー登録事項をはじめとする個人情報の全部又は一部を、第三者に委託することがあります。
                </Section>

                <div className="mt-[8px] pt-[16px] border-t border-[#eaf0f6]">
                  <p className="font-medium text-[13px] text-[#45576f]">お問い合わせ先</p>
                  <p className="mt-[4px] whitespace-pre-line">
                    {"ハンファジャパン株式会社　Q.PARTNERS事務局\nTel: 0120-801-170\nEmail: q-partners@hqj.co.jp\n受付時間：平日10:00-12:00、13:00-17:00"}
                  </p>
                  <p className="mt-[12px] text-[12px] text-[#999]">制定日：平成30年8月1日</p>
                </div>
              </div>

              {/* ボタン */}
              <div className="flex gap-[8px] items-center justify-center w-full">
                <Button
                  variant="primary"
                  onClick={handleClose}
                  className="w-[120px]"
                >
                  確認
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-[14px] text-[#101010] mb-[6px]">{title}</h3>
      <p className="whitespace-pre-line">{children}</p>
    </div>
  );
}
