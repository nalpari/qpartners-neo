"use client";

// 발송 타이밍 카드 — 即時配信(즉시) / 予約配信(예약) 선택 + 예약 시 날짜·시·분 분리 입력.
// react-datepicker 의 showTimeSelect 는 5분 간격 전체를 한 리스트로 노출해 선택이 불편하므로,
// 날짜는 DatePicker(일 단위), 시/분은 각각 SelectBox 로 분리한다.

import { useState } from "react";

import { DatePicker, Radio, SelectBox } from "@/components/common";

export type SendType = "immediate" | "scheduled";

/** 분 선택 간격(분). 5분 단위 → 12개 옵션. */
const MINUTE_STEP = 5;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: String(h).padStart(2, "0"),
}));

const MINUTE_OPTIONS = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => {
  const m = i * MINUTE_STEP;
  return { value: String(m), label: String(m).padStart(2, "0") };
});

/** base(없으면 오늘 0시) 를 복제해 초 이하를 0 으로 맞춘 Date. 이벤트 핸들러에서만 호출. */
function cloneBase(base: Date | null): Date {
  const d = base ? new Date(base) : new Date();
  if (!base) d.setHours(0, 0, 0, 0);
  d.setSeconds(0, 0);
  return d;
}

interface BulkMailFormScheduleProps {
  sendType: SendType;
  onSendTypeChange: (sendType: SendType) => void;
  scheduledSendAt: Date | null;
  onScheduledSendAtChange: (date: Date | null) => void;
  disabled: boolean;
}

export function BulkMailFormSchedule({
  sendType,
  onSendTypeChange,
  scheduledSendAt,
  onScheduledSendAtChange,
  disabled,
}: BulkMailFormScheduleProps) {
  // 날짜 최소값 — 마운트 시각 스냅샷으로 과거 날짜 선택 UX 차단. 저장 시 서버가 미래 여부 최종 검증(400/409).
  const [minDate] = useState(() => new Date());

  // 날짜만 변경 — 기존 시/분 유지(신규 선택 시 0시 0분).
  const handleDateChange = (date: Date | null) => {
    if (!date) {
      onScheduledSendAtChange(null);
      return;
    }
    const next = cloneBase(scheduledSendAt);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    onScheduledSendAtChange(next);
  };

  const handleHourChange = (value: string) => {
    const next = cloneBase(scheduledSendAt);
    next.setHours(Number(value));
    onScheduledSendAtChange(next);
  };

  const handleMinuteChange = (value: string) => {
    const next = cloneBase(scheduledSendAt);
    next.setMinutes(Number(value));
    onScheduledSendAtChange(next);
  };

  const hourValue = scheduledSendAt ? String(scheduledSendAt.getHours()) : "";
  const minuteValue = scheduledSendAt ? String(scheduledSendAt.getMinutes()) : "";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#101010]">
        配信タイミング
        <span className="text-[#FF1A1A]">*</span>
      </h3>
      {/* min-h-[44px] — 예약 선택 시 나타나는 일시 입력(높이 44px)과 동일 높이를 항상 확보해
          즉시↔예약 전환 시 카드/배경이 위아래로 밀리는 레이아웃 점프를 방지. */}
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 min-h-[44px]">
        <Radio
          name="sendType"
          checked={sendType === "immediate"}
          onChange={() => onSendTypeChange("immediate")}
          label="即時配信"
          disabled={disabled}
        />
        <Radio
          name="sendType"
          checked={sendType === "scheduled"}
          onChange={() => onSendTypeChange("scheduled")}
          label="予約配信"
          disabled={disabled}
        />
        {sendType === "scheduled" && (
          <div className="flex items-center gap-2">
            <div className="w-[160px]">
              <DatePicker
                value={scheduledSendAt}
                onChange={handleDateChange}
                minDate={minDate}
                placeholder="日付を選択"
                disabled={disabled}
              />
            </div>
            <div className="w-[84px]">
              <SelectBox
                options={HOUR_OPTIONS}
                value={hourValue}
                onChange={handleHourChange}
                placeholder="時"
                disabled={disabled}
              />
            </div>
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">時</span>
            <div className="w-[84px]">
              <SelectBox
                options={MINUTE_OPTIONS}
                value={minuteValue}
                onChange={handleMinuteChange}
                placeholder="分"
                disabled={disabled}
              />
            </div>
            <span className="font-['Noto_Sans_JP'] text-[14px] text-[#101010]">分</span>
          </div>
        )}
      </div>
    </div>
  );
}
