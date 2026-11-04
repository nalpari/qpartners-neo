"use client";

/**
 * 첨부파일 일괄 다운로드 — 목록 그리드의 `添付` 컬럼 공용.
 *
 * 자료일람(`contents-table.tsx`)과 제품상세의 자료 목록(`product-detail.tsx`)이 **같은 셀**을
 * 써야 한다. 제품상세는 종전에 첨부 **건수(숫자)** 를 찍고 있어 자료일람과 모양이 달랐다
 * (Redmine #2759). 한쪽만 고치면 다시 갈라지므로 렌더러를 여기로 끌어냈다.
 *
 * 행 타입은 `id` + `attachmentCount` 만 요구한다 — 자료일람의 `ContentListItem` 과
 * 제품상세의 `ProductDocument` 가 둘 다 만족한다.
 */

import Image from "next/image";
import { isAxiosError } from "axios";
import type { ICellRendererParams } from "ag-grid-community";

import { useAlertStore } from "@/lib/store";
import { parseContentDispositionFilename } from "@/lib/content-disposition";

/** 첨부 셀이 요구하는 최소 행 형태 */
export interface AttachmentRow {
  id: number;
  attachmentCount: number;
}

export type DownloadResult =
  | { ok: true }
  /** 실패 시 axios 응답 상태 코드 (네트워크 단절 등 응답 자체가 없으면 undefined) */
  | { ok: false; status?: number };

/** 컨텐츠 첨부파일 일괄 다운로드 (ZIP) — fetch + blob으로 에러 감지 */
export async function downloadAllAttachments(contentId: number): Promise<DownloadResult> {
  try {
    const { default: api } = await import("@/lib/axios");
    const res = await api.get<Blob>(`/contents/${contentId}/files/download-all`, {
      responseType: "blob",
    });
    // blob URL 다운로드 시 a.download 가 비어 있으면 브라우저가 Content-Disposition 을
    // 무시하고 blob URL 의 마지막 segment(UUID) 를 파일명으로 사용한다.
    // 서버 응답 헤더(`{title}_{YYYYMMDD}.zip` 또는 단일 파일 원본명) 를 파싱해 명시한다.
    const dispo =
      typeof res.headers["content-disposition"] === "string"
        ? res.headers["content-disposition"]
        : null;
    const fileName = parseContentDispositionFilename(dispo) ?? "download.zip";
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 브라우저가 Blob URL을 읽기 전에 즉시 해제하면 일부 브라우저에서 0바이트 다운로드가
    // 발생하므로, 충분한 시간을 준 뒤 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return { ok: true };
  } catch (err: unknown) {
    if (isAxiosError(err)) {
      console.error("[Contents] ZIP 일괄 다운로드 실패:", {
        status: err.response?.status,
        data: err.response?.data,
      });
    } else {
      console.error("[Contents] ZIP 일괄 다운로드 실패:", err);
    }
    const status = isAxiosError(err) ? err.response?.status : undefined;
    return { ok: false, status };
  }
}

/** status 코드별 안내 메시지 — download-all/route.ts 가 실제로 내려주는 상태코드(403/404/413/500)와 매칭. */
export function resolveDownloadErrorMessage(status: number | undefined): string {
  switch (status) {
    case 403:
      return "この操作を行う権限がありません。";
    case 404:
      return "対象が見つかりません。既に削除された可能性があります。";
    case 413:
      return "ファイルサイズが大きすぎてダウンロードできません。";
    default:
      return "ファイルの一括ダウンロードに失敗しました。";
  }
}

/** `添付` 컬럼 셀 — 첨부가 있을 때만 다운로드 아이콘을 낸다(0건은 빈 칸). */
export function AttachmentCellRenderer(params: ICellRendererParams<AttachmentRow>) {
  const { openAlert } = useAlertStore();

  if (!params.data || params.data.attachmentCount === 0) return null;
  const contentId = params.data.id;

  const handleClick = async () => {
    const result = await downloadAllAttachments(contentId);
    if (!result.ok) {
      openAlert({ type: "alert", message: resolveDownloadErrorMessage(result.status) });
    }
  };

  return (
    <div className="flex items-center justify-center w-full">
      <button
        type="button"
        aria-label="添付ファイルダウンロード"
        className="cursor-pointer"
        onClick={() => {
          void handleClick();
        }}
      >
        <Image
          src="/asset/images/layout/download_icon.svg"
          alt=""
          width={16}
          height={18}
          unoptimized
        />
      </button>
    </div>
  );
}
