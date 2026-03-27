"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Button, Checkbox } from "@/components/common";
import { useAlertStore, usePopupStore } from "@/lib/store";
import { DUMMY_PERMISSIONS } from "./permissions-dummy-data";
import type { PermissionItem } from "./permissions-dummy-data";
import type { RowClassParams } from "ag-grid-community";

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

/** 셀 내 InputBox — 로컬 state로 완전 독립 관리, blur 시 ref에만 반영 (리렌더 없음) */
function CellInput({
  defaultValue,
  placeholder,
  onChange,
}: {
  defaultValue: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="flex-1 min-w-0 h-[42px] px-4 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none hover:border-[#D1D1D1] focus:border-[#101010] placeholder:text-[#AAAAAA]"
    />
  );
}

export function PermissionsTable() {
  const { openAlert } = useAlertStore();
  const [rows, setRows] = useState<PermissionItem[]>(DUMMY_PERMISSIONS);
  const [activeOnly, setActiveOnly] = useState(false);

  const newRowFieldsRef = useRef({ code: "", name: "", description: "" });

  const filteredRows = activeOnly ? rows.filter((r) => r.isActive === "Y") : rows;
  const hasNewRow = rows.some((r) => r.isNew);

  const handleAdd = () => {
    if (hasNewRow) return;
    newRowFieldsRef.current = { code: "", name: "", description: "" };
    const newRow: PermissionItem = {
      id: `new-${Date.now()}`,
      code: "",
      name: "",
      description: "",
      isActive: "Y",
      isNew: true,
      isSaved: false,
    };
    setRows([newRow, ...rows]);
  };

  const handleCancelAdd = () => {
    setRows((prev) => prev.filter((r) => !r.isNew));
    newRowFieldsRef.current = { code: "", name: "", description: "" };
  };

  const handleSave = () => {
    const fields = newRowFieldsRef.current;
    setRows((prev) =>
      prev.map((r) =>
        r.isNew
          ? { ...r, ...fields, isNew: false, isSaved: true }
          : r
      )
    );
    newRowFieldsRef.current = { code: "", name: "", description: "" };
    openAlert({
      type: "alert",
      message: "保存されました。",
      confirmLabel: "確認",
    });
  };

  const updateNewRowField = (field: "code" | "name" | "description", value: string) => {
    newRowFieldsRef.current[field] = value;
  };

  const commitField = (id: string, field: keyof PermissionItem, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // cellRenderer: 권한코드
  function CodeCellRenderer(params: ICellRendererParams<PermissionItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.code}
          placeholder="コード入力"
          onChange={(v) => updateNewRowField("code", v)}
        />
      );
    }
    return (
      <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
        {data.code}
      </span>
    );
  }

  // cellRenderer: 권한명
  function NameCellRenderer(params: ICellRendererParams<PermissionItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.name}
          placeholder="権限名入力"
          onChange={(v) => updateNewRowField("name", v)}
        />
      );
    }
    return (
      <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
        {data.name}
      </span>
    );
  }

  // cellRenderer: 권한설명
  function DescCellRenderer(params: ICellRendererParams<PermissionItem>) {
    const data = params.data;
    if (!data) return null;
    if (data.isNew) {
      return (
        <CellInput
          defaultValue={newRowFieldsRef.current.description}
          placeholder="説明入力"
          onChange={(v) => updateNewRowField("description", v)}
        />
      );
    }
    return (
      <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555]">
        {data.description}
      </span>
    );
  }

  // cellRenderer: 사용여부
  function ActiveCellRenderer(params: ICellRendererParams<PermissionItem>) {
    const data = params.data;
    if (!data || data.isNew) return null;
    return (
      <div className="relative w-[100px]">
        <select
          value={data.isActive}
          onChange={(e) => commitField(data.id, "isActive", e.target.value)}
          className="appearance-none w-full h-[38px] leading-[38px] pl-4 pr-10 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[14px] text-[#101010] outline-none cursor-pointer hover:border-[#D1D1D1] focus:border-[#101010]"
        >
          <option value="Y">Y</option>
          <option value="N">N</option>
        </select>
        <Image
          src="/asset/images/common/select_arr.svg"
          alt=""
          width={24}
          height={24}
          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        />
      </div>
    );
  }

  // cellRenderer: Menu 버튼
  function MenuCellRenderer(params: ICellRendererParams<PermissionItem>) {
    const data = params.data;
    if (!data || data.isNew) return null;

    const openPopup = usePopupStore.getState().openPopup;

    return (
      <Button
        variant="outline"
        onClick={() => openPopup("permission-menu", { permissionName: data.name })}
        className="!h-[38px] !min-w-[80px] !px-4 !text-[13px]"
      >
        Menu
      </Button>
    );
  }

  const columnDefs: ColDef<PermissionItem>[] = [
    {
      headerName: "権限コード",
      field: "code",
      flex: 1,
      cellRenderer: CodeCellRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
    {
      headerName: "権限名",
      field: "name",
      flex: 1.5,
      cellRenderer: NameCellRenderer,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
    {
      headerName: "権限説明",
      field: "description",
      flex: 2,
      cellRenderer: DescCellRenderer,
      headerClass: "ag-header-cell-center",
      suppressKeyboardEvent: () => true,
    },
    {
      headerName: "使用可否",
      field: "isActive",
      flex: 0.8,
      cellRenderer: ActiveCellRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
    {
      headerName: "Available Menu Setting",
      field: "isSaved",
      flex: 1,
      cellRenderer: MenuCellRenderer,
      cellStyle: centerCellStyle,
      headerClass: "ag-header-cell-center",
    },
  ];

  const getRowClass = (params: RowClassParams<PermissionItem>) => {
    if (params.data?.isNew) return "ag-row-new";
    return undefined;
  };

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 바 */}
      <div className="flex items-center justify-between">
        <Checkbox
          checked={activeOnly}
          onChange={setActiveOnly}
          label="使用可否がYの値のみ表示"
        />
        <div className="flex items-center gap-2">
          {hasNewRow ? (
            <Button variant="outline" onClick={handleCancelAdd}>
              キャンセル
            </Button>
          ) : (
            <Button variant="outline" onClick={handleAdd}>
              追加
            </Button>
          )}
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>

      {/* AG Grid */}
      <DataGrid<PermissionItem>
        columnDefs={columnDefs}
        rowData={filteredRows}
        getRowClass={getRowClass}
        className="permissions-grid"
      />
    </div>
  );
}
