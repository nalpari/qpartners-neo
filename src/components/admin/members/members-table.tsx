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
import { STATUS_LABEL_MAP, formatDateTime, formatDate } from "./members-types";
import { useUserType } from "@/hooks/use-user-type";
import { useIsInternal } from "@/hooks/use-is-internal";
import { CENTER_CELL_STYLE } from "@/lib/constants";

// AG Grid cellRenderer 는 컴포넌트 외부 함수라 React hook 직접 사용 불가.
// USER_TYPE 동적 reverseMap(일본어 라벨 → 영문 코드) 은 context 로 주입한다.
type MembersGridContext = { userTypeReverseMap: Record<string, string> };

function NameCellRenderer(params: ICellRendererParams<MemberListItem>) {
  const data = params.data;
  if (!data) return null;

  const openPopup = usePopupStore.getState().openPopup;
  const ctx = (params.context ?? {}) as MembersGridContext;
  // USER_TYPE 공통코드 reverseMap 만 사용 — 하드코딩 fallback 제거됨.
  // 매핑 불가 시 (공통코드 미등록·API 실패) 버튼을 비활성 + "-" 처럼 표시해 popup 진입 차단.
  const userTp = ctx.userTypeReverseMap[data.userType];

  const handleClick = () => {
    if (!userTp) {
      console.warn("[MembersTable] 매핑 불가 userType:", data.userType);
      return;
    }
    openPopup("member-detail", { userId: data.userId, userTp, listItem: data });
  };

  if (!userTp) {
    return (
      <span className="font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#AAAAAA]">
        {data.userName}
      </span>
    );
  }

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

  // [一般会員 新規登録] 노출 제어 — UI hint 전용.
  // 실제 권한 판정은 /signup 페이지 가드와 /api/auth/signup 핸들러의 isInternalUser 가 담당.
  const isInternal = useIsInternal();

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
        <div className="flex items-center gap-2">
          {/* 신규 탭으로 여는 이유: 회원관리 목록의 검색조건·페이지 상태를 유지한 채
              연속 등록 후 목록으로 돌아올 수 있게 하기 위함. */}
          {isInternal && (
            <a
              href="/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[42px] min-w-[68px] px-4 rounded-[4px] bg-[#E97923] border border-[#CB6212] text-white shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] font-['Noto_Sans_JP'] font-medium text-[13px] leading-[1.5] text-center whitespace-nowrap transition-colors duration-150 hover:bg-[#B05713] hover:border-[#8A4007] hover:shadow-none"
            >
              一般会員 新規登録
            </a>
          )}
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        </div>
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
          autoHeight={!(isLoading || list.length === 0)}
          maxHeight={isLoading || list.length === 0 ? 200 : undefined}
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
