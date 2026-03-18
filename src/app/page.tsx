"use client";

import { useState, useMemo } from "react";
import type { ColDef } from "ag-grid-community";
import { Button } from "@/components/common/button";
import { Checkbox } from "@/components/common/checkbox";
import { DatePicker } from "@/components/common/date-picker";
import { InputBox } from "@/components/common/input-box";
import { Pagination } from "@/components/common/pagination";
import { Radio } from "@/components/common/radio";
import { SelectBox } from "@/components/common/select-box";
import { Toggle } from "@/components/common/toggle";
import { DataGrid } from "@/components/ag-grid";

const SAMPLE_OPTIONS = [
  { label: "登録日", value: "registered" },
  { label: "更新日", value: "updated" },
  { label: "削除日", value: "deleted" },
];

interface SampleRow {
  no: number;
  name: string;
  department: string;
  position: string;
  email: string;
  status: string;
  joinDate: string;
}

const sampleColumnDefs: ColDef<SampleRow>[] = [
  { field: "no", headerName: "No", width: 80, cellStyle: { justifyContent: "center" } },
  { field: "name", headerName: "氏名", flex: 1 },
  { field: "department", headerName: "部署", flex: 1 },
  { field: "position", headerName: "役職", flex: 1 },
  { field: "email", headerName: "メール", flex: 1.5 },
  {
    field: "status",
    headerName: "状態",
    width: 100,
    cellStyle: { justifyContent: "center" },
  },
  { field: "joinDate", headerName: "入社日", width: 120, cellStyle: { justifyContent: "center" } },
];

const sampleRowData: SampleRow[] = Array.from({ length: 25 }, (_, i) => ({
  no: i + 1,
  name: ["田中太郎", "佐藤花子", "鈴木一郎", "高橋美咲", "渡辺健太"][i % 5],
  department: ["営業部", "開発部", "人事部", "経理部", "企画部"][i % 5],
  position: ["部長", "課長", "主任", "担当", "マネージャー"][i % 5],
  email: `user${i + 1}@example.com`,
  status: i % 3 === 0 ? "在籍" : i % 3 === 1 ? "休職" : "退職",
  joinDate: `202${i % 5}-0${(i % 9) + 1}-15`,
}));

export default function Home() {
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [clearableValue, setClearableValue] = useState("保証申請期限の施");
  const [radioValue, setRadioValue] = useState("option1");
  const [dateValue, setDateValue] = useState<Date | null>(null);
  const [toggleValue, setToggleValue] = useState(false);
  const [gridPage, setGridPage] = useState(1);

  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(sampleRowData.length / PAGE_SIZE);
  const pagedRowData = useMemo(() => {
    const start = (gridPage - 1) * PAGE_SIZE;
    return sampleRowData.slice(start, start + PAGE_SIZE);
  }, [gridPage]);

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

      {/* AG Grid 예시 테이블 */}
      <div className="w-[1200px] mt-10 bg-white rounded-2xl shadow-[0px_8px_40px_0px_rgba(0,0,0,0.05)] px-[42px] pt-[34px] pb-[42px]">
        <h2 className="text-[18px] font-semibold text-[#304961] mb-6">社員一覧</h2>
        <div className="flex flex-col gap-6">
          <DataGrid<SampleRow>
            columnDefs={sampleColumnDefs}
            rowData={pagedRowData}
          />
          {totalPages > 1 && (
            <Pagination
              currentPage={gridPage}
              totalPages={totalPages}
              onPageChange={setGridPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
