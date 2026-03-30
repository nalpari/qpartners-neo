// Design Ref: §6.1 — 유저 프로필 카드 (Figma 272-735)

import Link from "next/link";
import Image from "next/image";

export function HomeProfile() {
  return (
    <div
      className="lg:rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] overflow-hidden"
      style={{ backgroundImage: "linear-gradient(90deg, rgba(68,76,213,0.1) 0%, rgba(68,76,213,0.1) 100%), linear-gradient(180deg, rgb(239,223,141) 0%, rgb(255,202,187) 100%)" }}
    >
      <div className="flex flex-col items-center gap-[16px] rounded-[24px] px-[28px] py-[29px] m-[8px]">
        <div className="flex flex-col items-center gap-[24px] w-full">
          {/* Avatar + Edit */}
          <div className="flex flex-col items-center gap-[16px]">
            <div className="relative">
              <div className="size-[98px] rounded-full bg-[rgba(65,55,42,0.4)] overflow-hidden">
                <Image
                  src="/asset/images/contents/user_avartar.svg"
                  alt=""
                  width={98}
                  height={98}
                  className="size-full object-cover"
                />
              </div>
              <div className="absolute right-0 bottom-0 size-[28px]">
                <Image
                  src="/asset/images/contents/profile_edit_icon.svg"
                  alt="編集"
                  width={28}
                  height={28}
                />
              </div>
            </div>
            <p className="font-['Noto_Sans_JP'] font-bold text-[16px] text-white leading-[1.4] whitespace-nowrap">
              ホンギルドン ! 金志映
            </p>
          </div>

          {/* Mypage Button */}
          <Link
            href="/mypage"
            className="flex items-center justify-center gap-[8px] w-full p-[12px] bg-[rgba(255,255,255,0.95)] rounded-full transition-colors hover:bg-white"
          >
            <Image
              src="/asset/images/contents/mypage_icon.svg"
              alt=""
              width={22}
              height={22}
            />
            <span className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#efa48d] uppercase leading-[1.3]">
              私の情報/会社情報
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
