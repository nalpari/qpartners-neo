"use client";

import { useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, SelectBox } from "@/components/common";
import { DUMMY_MEMBERS } from "./members-dummy-data";
import type { MemberItem } from "./members-dummy-data";

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

export function MembersTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState("100");

  const totalCount = DUMMY_MEMBERS.length;
  const totalPages = Math.ceil(totalCount / Number(perPage));

  const columnDefs = useMemo<ColDef<MemberItem>[]>(
    () => [
      {
        headerName: "状態",
        field: "status",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "ID",
        field: "id",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名",
        field: "name",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名ひらがな",
        field: "nameKana",
        flex: 1.2,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "Email",
        field: "email",
        flex: 1.5,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "会員タイプ",
        field: "memberType",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "最近アクセス日時",
        field: "lastAccessAt",
        flex: 1.2,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "会社名",
        field: "companyName",
        flex: 1.2,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録日",
        field: "createdAt",
        flex: 1,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 */}
      <div className="flex items-center justify-between">
        <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
          合計{" "}
          <span className="font-semibold text-[#E97923]">
            {totalCount.toLocaleString()}
          </span>
          件
        </p>
        <div className="w-[100px]">
          <SelectBox
            options={PER_PAGE_OPTIONS}
            value={perPage}
            onChange={setPerPage}
            
          />
        </div>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<MemberItem>
          columnDefs={columnDefs}
          rowData={DUMMY_MEMBERS}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
