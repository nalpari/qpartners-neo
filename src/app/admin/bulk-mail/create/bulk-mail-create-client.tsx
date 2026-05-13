"use client";

// Design Ref: §5.2 — 등록 페이지 client 부분 (sessionStorage 복사 데이터 로드 + 폼 렌더)
// server `page.tsx` 가 RBAC 진입 가드(`requirePageMenuPermission("ADM_BULK_MAIL", "create")`) 통과 후 마운트.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import {
  resolveCreateBody,
  type FormMode,
  type FormInitialData,
} from "@/components/admin/bulk-mail/bulk-mail-types";

function loadCopyData(): { mode: FormMode; initialData?: Partial<FormInitialData> } {
  if (typeof window === "undefined") return { mode: "create" };

  const stored = sessionStorage.getItem("mass-mail-copy");
  if (!stored) return { mode: "create" };

  sessionStorage.removeItem("mass-mail-copy");
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return { mode: "create" };
    const data = parsed as Record<string, unknown>;
    const initialData: Partial<FormInitialData> = {
      senderName: typeof data.senderName === "string" ? data.senderName : undefined,
      targetRoleCodes: Array.isArray(data.targetRoleCodes)
        ? data.targetRoleCodes.filter((t): t is string => typeof t === "string")
        : undefined,
      optOut: typeof data.optOut === "boolean" ? data.optOut : undefined,
      subject: typeof data.subject === "string" ? data.subject : undefined,
      body: typeof data.body === "string" ? data.body : undefined,
      attachments: [],
    };
    return { mode: "copy", initialData };
  } catch (error: unknown) {
    console.warn("[BulkMailCreatePage] mass-mail-copy 데이터 파싱 실패:", error);
    return { mode: "create" };
  }
}

export function BulkMailCreateClient() {
  const [initial] = useState(loadCopyData);
  const { data: user = null } = useQuery<LoginUser | null>({
    queryKey: ["auth", "login-user-info"],
    queryFn: () => null,
    staleTime: Infinity,
    enabled: false,
  });

  // 본문 초기값 — resolveCreateBody 가 mode 별 분기 처리:
  //   - 순수 create: DEFAULT_BULK_MAIL_BODY_HTML (빈 단락 + 서명)
  //   - copy + 원본에 서명 있음: 원본 그대로 (중복 방지)
  //   - copy + 레거시 본문(서명 미포함): 원본 + 서명 자동 추가 (UX 일관성)
  const initialData: Partial<FormInitialData> = {
    ...initial.initialData,
    body: resolveCreateBody(initial.initialData?.body),
    createdBy: user?.userId ?? "",
    createdByName: user?.userNm ?? null,
  };

  return <BulkMailForm mode={initial.mode} initialData={initialData} />;
}
