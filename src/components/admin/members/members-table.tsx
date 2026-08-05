"use client";

// Design Ref: §4.3 — AG Grid + useQuery + 페이지네이션

import { useMemo } from "react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid/data-grid";
import { Pagination, PageSizeSelect, Button } from "@/components/common";
import { usePopupStore, useAlertStore } from "@/lib/store";
import { useIsInternal } from "@/hooks/use-is-internal";
import type { MemberListItem, MemberListResponse, MemberSearchFilters } from "./members-types";
import { STATUS_LABEL_MAP, formatDateTime, formatDate } from "./members-types";
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

  // 일반회원 신규등록 버튼 — 슈퍼관리자/관리자(userTp="ADMIN" = authRole SUPER_ADMIN·ADMIN)만 노출.
  // 매트릭스(ADM_MEMBER create) 대신 역할로 고정 — 다른 역할에 create 권한이 부여돼도 노출 안 됨.
  const isInternal = useIsInternal();
  const openAlert = useAlertStore((s) => s.openAlert);

  // 새 탭에서 회원등록 화면(/signup — 관리자 대리등록 모드)을 연다.
  // noopener feature 를 주면 정상 개설에도 반환값이 null 이라 차단 판정이 불가하다(WHATWG HTML).
  // 따라서 feature 없이 열고 opener 를 수동으로 끊어(reverse tabnabbing 방지) 보안을 유지하면서,
  // 반환값(null=차단)으로만 팝업 차단을 감지해 안내한다. (/signup 은 same-origin 이라 opener=null 적용 가능)
  const handleCreateMember = () => {
    const win = window.open("/signup", "_blank");
    if (win) {
      win.opener = null;
    } else {
      openAlert({
        type: "alert",
        message: "ポップアップがブロックされました。ブラウザの設定をご確認ください。",
      });
    }
  };
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
        <div className="flex items-center gap-3">
          {isInternal && (
            <Button variant="primary" onClick={handleCreateMember}>
              一般会員 新規登録
            </Button>
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
