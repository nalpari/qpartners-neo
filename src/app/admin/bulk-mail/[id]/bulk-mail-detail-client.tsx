"use client";

// Design Ref: §4 — 상세 페이지 client 부분 (useQuery + 모드 결정)
// server `page.tsx` 가 RBAC 진입 가드(`requirePageMenuPermission("ADM_BULK_MAIL", "read")`) 통과 후 마운트.

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Spinner, Button } from "@/components/common";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import type { MassMailDetailResponse } from "@/components/admin/bulk-mail/bulk-mail-types";
import { toFormInitialData } from "@/components/admin/bulk-mail/bulk-mail-types";
import type { LoginUser } from "@/lib/schemas/auth";
import { canModifyClient } from "@/lib/auth-client";

interface BulkMailDetailClientProps {
  id: string;
}

export function BulkMailDetailClient({ id }: BulkMailDetailClientProps) {
  // 로그인 사용자 — TanStack Query 캐시 구독 (layout Gnb 가 /auth/login-user-info 로 주입)
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  const { data, isLoading, isError } = useQuery<MassMailDetailResponse>({
    queryKey: ["mass-mails", id],
    queryFn: () => api.get(`/admin/mass-mails/${id}`).then((r) => r.data),
    // 발송 상태 전이(pending→sending→sent/send_failed) 감사성 — 전역 false 설정을 override
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-[400px]">
        <Spinner size={48} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full h-[400px]">
        <p className="font-['Noto_Sans_JP'] text-[14px] text-[#999]">
          メール詳細の取得に失敗しました。
        </p>
        <Button variant="secondary" onClick={() => window.history.back()}>
          戻る
        </Button>
      </div>
    );
  }

  const detail = data.data;

  // 수정/삭제 권한 — SUPER_ADMIN=전체, ADMIN=SUPER_ADMIN 작성글 제외, 그외=본인
  const canModify = canModifyClient(user, detail);

  // Design Ref: §4.3 — draft → edit, sent/pending → detail
  // 권한 없으면 draft라도 detail 모드로 강등 (편집/삭제 UI 차단)
  const mode = (detail.status === "draft" && canModify) ? "edit" : "detail";

  return <BulkMailForm mode={mode} initialData={toFormInitialData(detail)} />;
}
