"use client";

// Design Ref: §5.2 — 등록 페이지 client 부분 (sessionStorage 복사 데이터 로드 + 폼 렌더)
// server `page.tsx` 가 RBAC 진입 가드(`requirePageMenuPermission("ADM_BULK_MAIL", "create")`) 통과 후 마운트.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LoginUser } from "@/lib/schemas/auth";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import {
  DEFAULT_BULK_MAIL_BODY_HTML,
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

  // 신규(create) 모드는 본문에 사무국 서명을 미리 채워두고, 사용자가 그 위에 본문을 작성하도록 한다.
  // copy 모드는 원본 메일의 body 를 그대로 살린다 (원본에 서명이 이미 들어있으므로 중복 방지).
  const initialData: Partial<FormInitialData> = {
    ...initial.initialData,
    body: initial.initialData?.body ?? DEFAULT_BULK_MAIL_BODY_HTML,
    createdBy: user?.userId ?? "",
    createdByName: user?.userNm ?? null,
  };

  return <BulkMailForm mode={initial.mode} initialData={initialData} />;
}
