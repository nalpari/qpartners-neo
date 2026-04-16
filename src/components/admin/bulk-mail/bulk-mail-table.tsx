"use client";

// Design Ref: §3.4 — useQuery + AG Grid + API 페이지네이션

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, SelectBox, Checkbox, Button, Spinner } from "@/components/common";
import type { MassMailListItem, MassMailListResponse, MassMailSearchParams, MassMailStatus } from "./bulk-mail-types";
import { STATUS_LABEL_MAP, formatMailDate } from "./bulk-mail-types";
import { PAGE_SIZE_OPTIONS_FALLBACK } from "@/lib/constants";
import { useCommonCode } from "@/hooks/use-common-code";

const centerCellStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

/** Design Ref: §3.4 — 제목 클릭 시 상세화면 이동 */
function TitleCellRenderer(params: ICellRendererParams<MassMailListItem>) {
  const data = params.data;
  if (!data) return null;

  return (
    <button
      type="button"
      className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer"
      onClick={() => {
        const router = params.context?.router;
        router?.push(`/admin/bulk-mail/${data.id}`, { transitionTypes: ["fade"] });
      }}
    >
      {data.subject}
    </button>
  );
}

interface BulkMailTableProps {
  searchParams: MassMailSearchParams;
}

export function BulkMailTable({ searchParams }: BulkMailTableProps) {
  const router = useRouter();
  const { options: pageSizeOptions } = useCommonCode("PAGE_SIZE", PAGE_SIZE_OPTIONS_FALLBACK);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState("100");
  const [draftOnly, setDraftOnly] = useState(false);

  // Design Ref: §3.4 — useQuery API 호출
  const queryParams = {
    keyword: searchParams.keyword || undefined,
    target: searchParams.target || undefined,
    authorSearchType: searchParams.authorSearchType || undefined,
    authorQuery: searchParams.authorQuery || undefined,
    startDate: searchParams.startDate || undefined,
    endDate: searchParams.endDate || undefined,
    draftOnly: draftOnly ? "true" : undefined,
    page: String(currentPage),
    pageSize: perPage,
  };

  const { data, isLoading, isError } = useQuery<MassMailListResponse>({
    queryKey: ["mass-mails", queryParams],
    queryFn: () => api.get("/admin/mass-mails", { params: queryParams }).then((r) => r.data),
  });

  const list = data?.data.list ?? [];
  const totalCount = data?.data.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / Number(perPage));

  const handleSendMail = () => {
    router.push("/admin/bulk-mail/create", { transitionTypes: ["fade"] });
  };

  // Design Ref: §5 — perPage 변경 시 1페이지 리셋
  const handlePerPageChange = (val: string) => {
    setPerPage(val);
    setCurrentPage(1);
  };

  // Plan SC: SC-04 — draftOnly 변경 시 1페이지 리셋
  const handleDraftOnlyChange = (checked: boolean) => {
    setDraftOnly(checked);
    setCurrentPage(1);
  };

  const columnDefs = useMemo<ColDef<MassMailListItem>[]>(
    () => [
      {
        headerName: "配信日",
        field: "sentAt",
        flex: 1,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => formatMailDate(params.value),
      },
      {
        headerName: "配信状態",
        field: "status",
        flex: 0.8,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => {
          const status = params.value as string;
          return (status in STATUS_LABEL_MAP ? STATUS_LABEL_MAP[status as MassMailStatus] : status) ?? status;
        },
      },
      {
        headerName: "配信対象",
        field: "targetsLabel",
        flex: 1.2,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "タイトル",
        field: "subject",
        flex: 2,
        cellRenderer: TitleCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "添付ファイル",
        field: "hasAttachment",
        flex: 0.6,
        cellDataType: false,
        cellStyle: centerCellStyle,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => params.value ? "Y" : "N",
      },
      {
        headerName: "登録者名",
        field: "senderName",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "登録者ID",
        field: "senderId",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-[18px] bg-white rounded-[12px] shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] pt-[34px] pb-[42px] px-[42px] w-[1440px]">
      {/* 상단 필터 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#101010]">
            送信メール一覧{" "}
            <span className="font-semibold text-[#E97923]">
              ({totalCount.toLocaleString()}件)
            </span>
          </p>
          <Checkbox
            checked={draftOnly}
            onChange={handleDraftOnlyChange}
            label="下書き保存メールのみ表示"
          />
        </div>
        <div className="flex items-center gap-[6px]">
          <Button variant="primary" onClick={handleSendMail}>
            メール発送
          </Button>
          <div className="w-[100px]">
            <SelectBox
              options={pageSizeOptions}
              value={perPage}
              onChange={handlePerPageChange}
            />
          </div>
        </div>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Spinner size={48} />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-[400px]">
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
              メール一覧の取得に失敗しました。ページを更新してください。
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
              データがありません
            </p>
          </div>
        ) : (
          <>
            <div style={{ maxHeight: 500, overflow: "auto" }}>
              <DataGrid<MassMailListItem>
                columnDefs={columnDefs}
                rowData={list}
                maxHeight={0}
                context={{ router }}
              />
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
