"use client";

// Design Ref: §4 — 상세 페이지 (useQuery + 모드 결정)

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Spinner, Button } from "@/components/common";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import type { MassMailDetailResponse } from "@/components/admin/bulk-mail/bulk-mail-types";
import { toFormInitialData } from "@/components/admin/bulk-mail/bulk-mail-types";
import { useAuthStore } from "@/lib/auth-store";
import { canModifyClient } from "@/lib/auth-client";

export default function AdminBulkMailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, isError } = useQuery<MassMailDetailResponse>({
    queryKey: ["mass-mails", id],
    queryFn: () => api.get(`/admin/mass-mails/${id}`).then((r) => r.data),
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
