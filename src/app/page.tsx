"use client";

import { useState } from "react";
import { Button } from "@/components/common/button";
import { Checkbox } from "@/components/common/checkbox";
import { DatePicker } from "@/components/common/date-picker";
import { InputBox } from "@/components/common/input-box";
import { Radio } from "@/components/common/radio";
import { SelectBox } from "@/components/common/select-box";
import { Toggle } from "@/components/common/toggle";

const SAMPLE_OPTIONS = [
  { label: "登録日", value: "registered" },
  { label: "更新日", value: "updated" },
  { label: "削除日", value: "deleted" },
];

export default function Home() {
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [clearableValue, setClearableValue] = useState("保証申請期限の施");
  const [radioValue, setRadioValue] = useState("option1");
  const [dateValue, setDateValue] = useState<Date | null>(null);
  const [toggleValue, setToggleValue] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-[#F5F5F5]">
      <div className="flex flex-col gap-8 w-[620px] bg-white rounded-2xl shadow-[0px_8px_40px_0px_rgba(0,0,0,0.05)] px-[42px] pt-[34px] pb-[42px]">
        {/* Select */}
        <SelectBox
          options={SAMPLE_OPTIONS}
          value={selected}
          onChange={setSelected}
          placeholder="保証申請期限の施"
        />

        {/* Input */}
        <InputBox
          value={inputValue}
          onChange={setInputValue}
          placeholder="保証申請期限の施"
        />

        {/* Date */}
        <DatePicker
          value={dateValue}
          onChange={setDateValue}
          placeholder="保証申請期限の施"
        />

        {/* Delete (clearable input) */}
        <InputBox
          value={clearableValue}
          onChange={setClearableValue}
          placeholder="保証申請期限の施"
          clearable
        />

        {/* Select disabled */}
        <SelectBox
          options={SAMPLE_OPTIONS}
          value=""
          placeholder="保証申請期限の施"
          disabled
        />

        {/* Input disabled */}
        <InputBox
          placeholder="保証申請期限の施"
          disabled
        />

        {/* Date disabled */}
        <DatePicker
          placeholder="保証申請期限の施"
          disabled
        />

        {/* Checkbox & Radio & Toggle */}
        <div className="flex items-center gap-4">
          <Checkbox checked={checked} onChange={setChecked} label="技術/方向性" />
          <Checkbox checked label="無効" disabled />
        </div>
        <div className="flex items-center gap-4">
          <Radio
            name="sample"
            value="option1"
            checked={radioValue === "option1"}
            onChange={() => setRadioValue("option1")}
            label="オプション1"
          />
          <Radio
            name="sample"
            value="option2"
            checked={radioValue === "option2"}
            onChange={() => setRadioValue("option2")}
            label="オプション2"
          />
          <Radio
            name="sample-disabled"
            label="無効"
            disabled
          />
        </div>
        <div className="flex items-center gap-4">
          <Toggle checked={toggleValue} onChange={setToggleValue} label="トグル" />
          <Toggle checked label="ON固定" disabled />
          <Toggle label="OFF固定" disabled />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <Button variant="primary">検索</Button>
          <Button variant="secondary">初期化</Button>
          <Button variant="outline">冗長チェック</Button>
          <Button variant="primary" disabled>無効</Button>
        </div>
        <Button variant="primary" size="lg" fullWidth>Login</Button>
      </div>
    </div>
  );
}
