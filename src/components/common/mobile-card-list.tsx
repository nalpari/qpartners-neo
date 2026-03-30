"use client";

import type { ReactNode } from "react";

export interface MobileCardField<T> {
  /** 카드에 표시될 라벨 */
  label: string;
  /** 데이터 키 */
  key: keyof T;
  /** 커스텀 렌더러 (지정하지 않으면 문자열로 표시) */
  render?: (item: T) => ReactNode;
  /** 첫 번째 행 우측에 표시할 액션 요소 */
  action?: (item: T) => ReactNode;
}

interface MobileCardListProps<T> {
  data: T[];
  fields: MobileCardField<T>[];
  keyExtractor: (item: T) => string;
  onItemClick?: (item: T) => void;
}

export function MobileCardList<T>({
  data,
  fields,
  keyExtractor,
  onItemClick,
}: MobileCardListProps<T>) {
  return (
    <div className="flex flex-col gap-[10px]">
      {data.map((item) => (
        <div
          key={keyExtractor(item)}
          className="bg-white px-6 py-[34px] cursor-pointer"
          onClick={() => onItemClick?.(item)}
          role={onItemClick ? "button" : undefined}
          tabIndex={onItemClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (onItemClick && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onItemClick(item);
            }
          }}
        >
          <div className="flex flex-col gap-[18px]">
            {fields.map((field, idx) => {
              const value = field.render
                ? field.render(item)
                : (item[field.key] as string) ?? "";

              return (
                <div
                  key={String(field.key)}
                  className={
                    idx > 0
                      ? "border-t border-[#EFF4F8] pt-[18px] flex flex-col gap-2"
                      : "flex flex-col gap-2"
                  }
                >
                  {field.action ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 flex flex-col gap-2">
                        <p className="font-['Noto_Sans_JP'] font-semibold text-[14px] leading-[1.5] text-[#45576F] truncate">
                          {field.label}
                        </p>
                        <div className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#555]">
                          {value}
                        </div>
                      </div>
                      {field.action(item)}
                    </div>
                  ) : (
                    <>
                      <p className="font-['Noto_Sans_JP'] font-semibold text-[14px] leading-[1.5] text-[#45576F] truncate">
                        {field.label}
                      </p>
                      <div className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#555]">
                        {value}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
