"use client";

// Design Ref: §5.2 — 등록 페이지 (복사 데이터 로드)

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { loginUserSchema } from "@/lib/schemas/auth";
import type { LoginUser } from "@/lib/schemas/auth";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import type { FormMode, FormInitialData } from "@/components/admin/bulk-mail/bulk-mail-types";

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
      targets: Array.isArray(data.targets) ? data.targets.filter((t): t is string => typeof t === "string") : undefined,
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

async function fetchAuthMe(): Promise<LoginUser | null> {
  try {
    const res = await api.get("/auth/login-user-info");
    const parsed = loginUserSchema.safeParse(res.data?.data);
    if (!parsed.success) {
      console.error("[BulkMailCreatePage] 응답 스키마 불일치:", parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    console.error("[BulkMailCreatePage] 인증 확인 실패:", error);
    return null;
  }
}

export default function AdminBulkMailCreatePage() {
  const [initial] = useState(loadCopyData);
  const { data: user } = useQuery({
    queryKey: ["auth", "login-user-info"],
    queryFn: fetchAuthMe,
    staleTime: 5 * 60 * 1000,
  });

  const initialData: Partial<FormInitialData> = {
    ...initial.initialData,
    createdBy: user?.userId ?? "",
    createdByName: user?.userNm ?? null,
  };

  return <BulkMailForm mode={initial.mode} initialData={initialData} />;
}
