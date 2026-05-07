"use client";

// Design Ref: §3.4 — useQuery + AG Grid + API 페이지네이션

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, PageSizeSelect, Checkbox, Button, PermissionGate } from "@/components/common";
import type { MassMailListItem, MassMailListResponse, MassMailSearchParams, MassMailStatus } from "./bulk-mail-types";
import { STATUS_LABEL_MAP, formatMailDate } from "./bulk-mail-types";
import { CENTER_CELL_STYLE } from "@/lib/constants";
import { usePageSize } from "@/hooks/use-page-size";
import { useTargetLabels } from "@/hooks/use-target-labels";
import { ADMIN_MENU } from "@/lib/menu-codes";

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
  // 페이지 사이즈 default 는 PAGE_SIZE 공통코드 sortOrder=1 항목을 따른다 (운영자 제어).
  const { pageSize: perPage, setPageSize: setPerPage } = usePageSize();
  const [currentPage, setCurrentPage] = useState(1);
  const [draftOnly, setDraftOnly] = useState(false);

  // 권한 라벨 동기화 — 配信対象 컬럼은 useTargetLabels 단일 출처. 비활성된 권한도 라벨 룩업 가능.
  const { resolveLabel: resolveTargetLabel } = useTargetLabels();

  // Design Ref: §3.4 — useQuery API 호출
  const queryParams = {
    keyword: searchParams.keyword || undefined,
    roleCode: searchParams.roleCode || undefined,
    authorSearchType: searchParams.authorSearchType || undefined,
    authorQuery: searchParams.authorQuery || undefined,
    startDate: searchParams.startDate || undefined,
    endDate: searchParams.endDate || undefined,
    draftOnly: draftOnly ? "true" : undefined,
    page: String(currentPage),
    pageSize: String(perPage),
  };

  const { data, isLoading } = useQuery<MassMailListResponse>({
    queryKey: ["mass-mails", queryParams],
    queryFn: () => api.get("/admin/mass-mails", { params: queryParams }).then((r) => r.data),
    // 발송 상태(pending→sending→sent/send_failed) 감사성 — 전역 false 설정을 override
    refetchOnWindowFocus: true,
  });

  const list = data?.data.list ?? [];
  const totalCount = data?.data.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / perPage);

  const handleSendMail = () => {
    router.push("/admin/bulk-mail/create", { transitionTypes: ["fade"] });
  };

  // Design Ref: §5 — perPage 변경 시 1페이지 리셋
  const handlePerPageChange = (val: number) => {
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
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => formatMailDate(params.value),
      },
      {
        headerName: "配信状態",
        field: "status",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => {
          const status = params.value as string;
          return (status in STATUS_LABEL_MAP ? STATUS_LABEL_MAP[status as MassMailStatus] : status) ?? status;
        },
      },
      {
        headerName: "配信対象",
        field: "targetRoleCodes",
        flex: 1.2,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => {
          const codes = params.value as string[] | undefined;
          if (!codes || codes.length === 0) return "—";
          return codes.map((c) => resolveTargetLabel(c)).join(", ");
        },
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
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => params.value ? "Y" : "N",
      },
      {
        headerName: "登録者名",
        field: "createdByName",
        flex: 1,
        headerClass: "ag-header-cell-center",
        valueFormatter: (params) => params.value ?? "—",
      },
      {
        headerName: "登録者ID",
        field: "senderId",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
    ],
    [resolveTargetLabel],
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
          {/* 「メール発送」 — 패턴 A (PermissionGate). canCreate=false 시 버튼 자체 숨김 */}
          <PermissionGate menuCode={ADMIN_MENU.BULK_MAIL} action="create" fallback={null}>
            <Button variant="primary" onClick={handleSendMail}>
              メール発送
            </Button>
          </PermissionGate>
          <PageSizeSelect value={perPage} onChange={handlePerPageChange} />
        </div>
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<MassMailListItem>
          columnDefs={columnDefs}
          rowData={list}
          context={{ router }}
          loading={isLoading}
        />
        {totalPages > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </div>
  );
}
