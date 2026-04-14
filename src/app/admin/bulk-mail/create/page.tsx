"use client";

// Design Ref: §5.2 — 등록 페이지 (복사 데이터 로드)

import { useState } from "react";
import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import type { FormMode, FormInitialData } from "@/components/admin/bulk-mail/bulk-mail-types";

function loadCopyData(): { mode: FormMode; initialData?: Partial<FormInitialData> } {
  if (typeof window === "undefined") return { mode: "create" };

  const stored = sessionStorage.getItem("mass-mail-copy");
  if (!stored) return { mode: "create" };

  sessionStorage.removeItem("mass-mail-copy");
  try {
    const parsed = JSON.parse(stored) as Partial<FormInitialData>;
    return { mode: "copy", initialData: { ...parsed, attachments: [] } };
  } catch {
    return { mode: "create" };
  }
}

export default function AdminBulkMailCreatePage() {
  const [initial] = useState(loadCopyData);

  return <BulkMailForm mode={initial.mode} initialData={initial.initialData} />;
}
