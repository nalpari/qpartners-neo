"use client";

import { useState } from "react";
import Image from "next/image";
import { usePopupStore } from "@/lib/store";
import { Button, Radio } from "@/components/common";

interface ZipcodeAddress {
  zipcode: string;
  prefecture: string;
  city: string;
  town: string;
}

const CLOSE_ANIMATION_MS = 200;

const COLUMN_HEADERS = ["都道府県", "市区町村", "町丁目以下"] as const;

export function ZipcodeSearchPopup() {
  const { popupData, closePopup } = usePopupStore();

  const [zipcode, setZipcode] = useState("");
  const [results, setResults] = useState<ZipcodeAddress[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const canApply = selectedIndex !== null;

  // Design Ref: §5.5 — Mock → zipcloud API 실제 호출
  const handleSearch = async () => {
    setError("");
    setResults([]);
    setSelectedIndex(null);

    if (!/^\d{7}$/.test(zipcode)) {
      setError(
        "登録された郵便番号に住所が見つかりません. もう一度入力してください."
      );
      return;
    }

    setHasSearched(true);
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`
      );
      if (!res.ok) {
        setError("住所検索中にエラーが発生しました。");
        return;
      }
      const data: {
        results: { zipcode: string; address1: string; address2: string; address3: string }[] | null;
      } = await res.json();

      if (!data.results || data.results.length === 0) {
        setError(
          "登録された郵便番号に住所が見つかりません. もう一度入力してください."
        );
        return;
      }

      setResults(
        data.results.map((r) => ({
          zipcode: r.zipcode,
          prefecture: r.address1,
          city: r.address2,
          town: r.address3,
        }))
      );
    } catch (err) {
      console.error("[ZipcodeSearch] 住所検索 API 呼び出し失敗:", err);
      setError("住所検索中にエラーが発生しました。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      closePopup();
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleApply = () => {
    if (selectedIndex === null) return;
    const selected = results[selectedIndex];
    const onSelect = popupData.onSelect as
      | ((addr: ZipcodeAddress) => void)
      | undefined;
    onSelect?.(selected);
    handleClose();
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
        className="popup-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="郵便番号検索"
      >
        <div className="popup-container__inner">
        {/* 타이틀 */}
        <div className="flex items-center w-full border-b-2 border-[#E97923] pb-3">
          <h2 className="flex-1 font-['Noto_Sans_JP'] text-[15px] font-semibold leading-[1.5] text-[#E97923]">
            郵便番号
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
        <div className="flex flex-col w-full">
          <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-col gap-7 w-full">
              {/* 검색 입력 + 에러 */}
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center gap-2 w-full h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] overflow-hidden transition-colors duration-150 focus-within:border-[#101010]">
                  <input
                    type="text"
                    value={zipcode}
                    onChange={(e) =>
                      setZipcode(e.target.value.replace(/\D/g, "").slice(0, 7))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    placeholder="郵便番号の7桁を入力してください"
                    inputMode="numeric"
                    maxLength={7}
                    className="flex-1 min-w-0 h-full font-['Noto_Sans_JP'] text-sm leading-[1.5] bg-transparent outline-none placeholder:text-[#999] text-[#101010]"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="shrink-0 cursor-pointer disabled:opacity-50"
                    aria-label="検索"
                  >
                    <Image
                      src="/asset/images/contents/search_icon.svg"
                      alt=""
                      width={16}
                      height={17}
                    />
                  </button>
                </div>

                {error && (
                  <div className="flex items-start gap-1.5 pl-px w-full">
                    <svg
                      className="shrink-0 mt-[3px]"
                      width="14"
                      height="13"
                      viewBox="0 0 14 13"
                      fill="none"
                    >
                      <path
                        d="M7 0L13.9282 13H0.0717969L7 0Z"
                        fill="#FF1A1A"
                      />
                      <text
                        x="7"
                        y="11"
                        textAnchor="middle"
                        fill="white"
                        fontSize="9"
                        fontWeight="bold"
                      >
                        !
                      </text>
                    </svg>
                    <p className="flex-1 font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#FF1A1A]">
                      {error}
                    </p>
                  </div>
                )}
              </div>

              {/* 결과 테이블 (항상 표시) */}
              <div className="flex flex-col w-full border-t border-[#101010]">
                {/* PC: 테이블 헤더 */}
                <div className="hidden lg:flex ">
                  {COLUMN_HEADERS.map((header, i) => (
                    <div
                      key={i}
                      className={`${
                        i === 2 ? "w-[178px]" : "flex-1"
                      } px-[18px] py-[14px] font-['Noto_Sans_JP'] text-sm font-semibold text-[#101010] text-center`}
                    >
                      {header}
                    </div>
                  ))}
                </div>

                {isSearching ? (
                  /* 검색 중 로딩 표시 */
                  <div className="flex items-center justify-center border-t border-[#101010] border-b border-b-[#E6EEF6] px-[18px] py-[14px]">
                    <p className="font-['Noto_Sans_JP'] text-[#999] text-center text-[12px]">
                      検索中...
                    </p>
                  </div>
                ) : results.length === 0 ? (
                  /* 빈 결과: 검색결과 없음 메시지 */
                  <div className="flex items-center justify-center border-t border-[#101010] border-b border-b-[#E6EEF6] px-[18px] py-[14px]">
                    <p className="font-['Noto_Sans_JP'] text-[#999] text-center text-[12px]">
                      {hasSearched
                        ? "検索結果がありません。"
                        : "郵便番号を入力して検索してください。"}
                    </p>
                  </div>
                ) : (
                  /* 결과 행 */
                  results.map((addr, idx) => (
                    <div key={idx}>
                      {/* PC 행 — 행 클릭으로 선택, 첫 행 이후 mt-[-1px] */}
                      <div
                        className={`hidden lg:flex border-t border-b border-[#E6EEF6] cursor-pointer hover:bg-[#F7F9FB] transition-colors duration-150 ${
                          idx > 0 ? "mt-[-1px]" : ""
                        } ${selectedIndex === idx ? "bg-[#F7F9FB]" : ""}`}
                        onClick={() => setSelectedIndex(idx)}
                      >
                        <div className="flex-1 flex items-center gap-2 px-[18px] py-[14px]">
                          <Radio
                            name="zipcode-address"
                            value={String(idx)}
                            checked={selectedIndex === idx}
                            onChange={() => setSelectedIndex(idx)}
                          />
                          <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F] overflow-hidden text-ellipsis whitespace-nowrap">
                            {addr.prefecture}
                          </span>
                        </div>
                        <div className="flex-1 flex items-center px-[18px] py-[14px]">
                          <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F]">
                            {addr.city}
                          </span>
                        </div>
                        <div className="w-[178px] flex items-center px-[18px] py-[14px]">
                          <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F]">
                            {addr.town}
                          </span>
                        </div>
                      </div>

                      {/* MO 카드 — 3블록 세로 구조, 행 클릭 선택 */}
                      <div
                        className={`lg:hidden cursor-pointer  ${
                          selectedIndex === idx ? "bg-[#F7F9FB]" : ""
                        }`}
                        onClick={() => setSelectedIndex(idx)}
                      >
                        {/* 블록1: 도도부현 — 라디오 포함, border-top #101010 */}
                        <div className={` flex flex-col gap-2 py-2 ${
                          idx > 0 ? "mt-[-1px]" : ""
                        }`}>
                          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] font-semibold text-[#101010]">
                            {COLUMN_HEADERS[0]}
                          </p>
                          <div className="flex items-center gap-2">
                            <Radio
                              name="zipcode-address"
                              value={String(idx)}
                              checked={selectedIndex === idx}
                              onChange={() => setSelectedIndex(idx)}
                            />
                            <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F] overflow-hidden text-ellipsis whitespace-nowrap">
                              {addr.prefecture}
                            </span>
                          </div>
                        </div>
                        {/* 블록2: 시구정촌 — 텍스트만 */}
                        <div className="flex flex-col gap-2 py-3">
                          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] font-semibold text-[#101010]">
                            {COLUMN_HEADERS[1]}
                          </p>
                          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F]">
                            {addr.city}
                          </p>
                        </div>
                        {/* 블록3: 시구정촌 이하 — 텍스트만, border-bottom */}
                        <div className="border-b border-[#E6EEF6] flex flex-col gap-2 py-3">
                          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] font-semibold text-[#101010]">
                            {COLUMN_HEADERS[2]}
                          </p>
                          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576F]">
                            {addr.town}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 하단 버튼 — Figma: 閉じる 71px, 住所適用 84px, gap 8px, center */}
            <div className="flex flex-col lg:flex-row lg:justify-center gap-2 w-full pb-1">
              <Button variant="secondary" onClick={handleClose} className="w-full lg:w-[71px]">
                閉じる
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={!canApply}
                className="w-full lg:w-[84px]"
              >
                住所適用
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
