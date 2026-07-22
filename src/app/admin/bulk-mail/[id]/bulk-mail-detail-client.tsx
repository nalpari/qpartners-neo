"use client";

// Design Ref: §4 — 상세 페이지 client 부분 (useQuery + 모드 결정)
// server `page.tsx` 가 RBAC 진입 가드(`requirePageMenuPermission("ADM_BULK_MAIL", "read")`) 통과 후 마운트.

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { Spinner, Button } from "@/components/common";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import type { MassMailDetailResponse } from "@/components/admin/bulk-mail/bulk-mail-types";
import {
  toFormInitialData,
  ensureBodyHasSignature,
} from "@/components/admin/bulk-mail/bulk-mail-types";
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

  // Design Ref: §4.3 — 편집 가능(draft 또는 미도래 예약) → edit, 그 외(발송/도래) → detail.
  // editable 은 서버가 진입 시점(서버 시간) 기준으로 산출 — 미도래 예약도 편집 허용.
  // 권한 없으면 편집 가능 상태라도 detail 모드로 강등 (편집/삭제 UI 차단).
  const mode = (detail.editable && canModify) ? "edit" : "detail";

  // edit 모드 진입 시 레거시 draft(textarea 시대 저장본 — 서명 미포함) 의 본문에 서명을 자동 보강.
  // 사용자가 그대로 발송해도 서명 없는 메일이 나가지 않도록 방어.
  // detail 모드는 발송 완료된 메일의 비활성 미리보기이므로 본문을 원본 그대로 보존.
  const initialData = toFormInitialData(detail);
  const finalInitialData = mode === "edit"
    ? { ...initialData, body: ensureBodyHasSignature(initialData.body) }
    : initialData;

  return <BulkMailForm mode={mode} initialData={finalInitialData} />;
}
