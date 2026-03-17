import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="flex items-center justify-center w-full border-t border-[rgba(0,0,0,0.04)] bg-[#fcfdff]">
      <div className="flex items-start gap-40 w-[1440px] py-[46px]">
        {/* 로고 영역 */}
        <div className="shrink-0">
          <Image
            src="/asset/images/layout/footer_logo.svg"
            alt="Hanwha Japan"
            width={163}
            height={30}
          />
        </div>

        {/* 정보 영역 */}
        <div className="flex flex-col gap-2">
          {/* 1행: 회사명 */}
          <p className="font-['Noto_Sans_JP'] font-semibold text-[14px] leading-[1.5] text-[#333]">
            한화재팬주식회사 Q.PARTNERS 사무국
          </p>

          {/* 2행: 연락처 + 이용약관 */}
          <p className="font-['Noto_Sans_JP'] font-normal text-[13px] leading-[1.5] text-[#999]">
            Tel:0120-801-170 Email : q-partners@hqj.co.jp
            <span className="mx-2">|</span>
            문의접수시간 : 평일10:00-12:00 13:00-17:00
            <span className="mx-2">|</span>
            <Link
              href="/terms"
              className="underline text-[#999] hover:text-[#333]"
            >
              이용약관
            </Link>
          </p>

          {/* 3행: 저작권 */}
          <p className="font-['Pretendard'] font-normal text-[13px] leading-[1.5] text-[#999]">
            COPYRIGHT©2026 Hanwha Japan All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
