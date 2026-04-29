"use client";

// Design Ref: §4.3 — AG Grid + useQuery + 페이지네이션

import { useMemo } from "react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, PageSizeSelect } from "@/components/common";
import { usePopupStore } from "@/lib/store";
import type { MemberListItem, MemberListResponse, MemberSearchFilters } from "./members-types";
import { STATUS_LABEL_MAP, USER_TYPE_REVERSE_MAP, formatDateTime, formatDate } from "./members-types";
import { useUserType } from "@/hooks/use-user-type";
import { CENTER_CELL_STYLE } from "@/lib/constants";

// AG Grid cellRenderer 는 컴포넌트 외부 함수라 React hook 직접 사용 불가.
// USER_TYPE 동적 reverseMap(일본어 라벨 → 영문 코드) 은 context 로 주입한다.
type MembersGridContext = { userTypeReverseMap: Record<string, string> };

function NameCellRenderer(params: ICellRendererParams<MemberListItem>) {
  const data = params.data;
  if (!data) return null;

  const openPopup = usePopupStore.getState().openPopup;
  const ctx = (params.context ?? {}) as MembersGridContext;
  // 동적 reverseMap(코드관리 USER_TYPE) 우선 시도, 미매핑 시 hardcoded fallback.
  // BE 서버 캐시(5분 TTL) ↔ FE TanStack Query 캐시(5분 staleTime) 의 갱신 타이밍이
  // 어긋나 동적 reverseMap 만으로는 영문 코드를 못 찾는 케이스를 차단하기 위함.
  // 두 경로 모두 실패 시에만 미매핑 처리(차단) — 기존 라벨 변경 운영 시 팝업 진입 보장.
  const userTp = ctx.userTypeReverseMap[data.userType] ?? USER_TYPE_REVERSE_MAP[data.userType];

  const handleClick = () => {
    if (!userTp) {
      console.warn("[MembersTable] 매핑 불가 userType:", data.userType);
      return;
    }
    openPopup("member-detail", { userId: data.userId, userTp, listItem: data });
  };

  return (
    <button
      type="button"
      className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#1060B4] underline cursor-pointer"
      onClick={handleClick}
    >
      {data.userName}
    </button>
  );
}

interface MembersTableProps {
  filters: MemberSearchFilters;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function MembersTable({
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: MembersTableProps) {
  // USER_TYPE 공통코드 reverseMap — 백엔드가 응답하는 일본어 라벨을 다시 영문 코드로 매핑.
  // 코드관리 변경 시 ["common-code","USER_TYPE"] invalidate 로 즉시 갱신됨.
  const { reverseMap: userTypeReverseMap } = useUserType();
  const gridContext = useMemo(
    () => ({ userTypeReverseMap }),
    [userTypeReverseMap],
  );

  // Design Ref: §4.3 — useQuery
  // staleTime: 0 + refetchOnMount/Focus 활성 — 최근접속일시(lastLoginAt) 등 외부에서 변경되는
  // 운영 데이터가 즉시 반영되도록 보장. 페이지 재진입·탭 포커스 복귀 시 자동 fetch.
  const { data, isLoading } = useQuery<MemberListResponse["data"]>({
    queryKey: ["admin", "members", filters, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (filters.userId) params.userId = filters.userId;
      if (filters.userName) params.userName = filters.userName;
      if (filters.email) params.email = filters.email;
      if (filters.companyName) params.companyName = filters.companyName;
      if (filters.userType) params.userType = filters.userType;
      if (filters.status) params.status = filters.status;

      const res = await api.get<MemberListResponse>("/admin/members", { params });
      return res.data.data;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const list = data?.list ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Design Ref: §4.3 — AG Grid 컬럼 (Plan §1.4 필드 매핑)
  const columnDefs = useMemo<ColDef<MemberListItem>[]>(
    () => [
      {
        headerName: "状態",
        field: "status",
        flex: 0.8,
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string>) => {
          const v = p.value ?? "";
          return STATUS_LABEL_MAP[v] ?? v;
        },
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "ID",
        field: "userId",
        flex: 1,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名",
        field: "userName",
        flex: 1,
        cellRenderer: NameCellRenderer,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "氏名ひらがな",
        field: "userNameKana",
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
        field: "userType",
        flex: 0.8,
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
      {
        headerName: "最近アクセス日時",
        field: "lastLoginAt",
        flex: 1.2,
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string | null>) =>
          formatDateTime(p.value ?? null),
        cellStyle: CENTER_CELL_STYLE,
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
        valueFormatter: (p: ValueFormatterParams<MemberListItem, string | null>) =>
          formatDate(p.value ?? null),
        cellStyle: CENTER_CELL_STYLE,
        headerClass: "ag-header-cell-center",
      },
    ],
    [],
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
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      </div>

      {/* AG Grid + Pagination */}
      <div className="flex flex-col gap-6">
        <DataGrid<MemberListItem>
          columnDefs={columnDefs}
          rowData={list}
          getRowId={(p) => p.data.id}
          context={gridContext}
          loading={isLoading}
          emptyMessage="検索結果がありません"
        />
        {totalPages > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
