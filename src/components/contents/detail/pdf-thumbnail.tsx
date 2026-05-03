"use client";

// Design Ref: Redmine #2168 — 첨부파일 PDF 의 첫페이지를 첨부파일 영역에서 미리보기로 제공.
//
// pdfjs-dist 자체가 메인 ~800KB + worker ~1.2MB 으로 무거워 본 컴포넌트 안에서 dynamic import —
// PDF 첨부가 있는 콘텐츠 상세 페이지를 진입했을 때만 번들을 로드한다 (PDF 없는 페이지는 영향 없음).
//
// 에러 시 부모(`ContentsDetailAttachment`)가 PDF 아이콘으로 fallback 하도록 onError(fileId) 콜백 호출 —
// React Compiler 의 `set-state-in-effect` 룰 회피 (effect 내부에서 setState 호출 시 룰 위반).
// 부모는 useState + useCallback 으로 에러 ID 셋을 관리해 안정 콜백을 전달.

import { useEffect, useRef } from "react";

interface PdfThumbnailProps {
  contentId: number;
  fileId: number;
  fileName: string;
  /** PDF 로드/렌더 실패 시 호출 — 부모가 fileId 기준으로 PDF 아이콘 fallback 처리 */
  onError: (fileId: number) => void;
}

/** 컨테이너 한 변 길이 — `contents-detail-attachment.tsx` 의 size-[180px] 박스에 맞춤 */
const CONTAINER_SIZE = 180;

export function PdfThumbnail({ contentId, fileId, fileName, onError }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: (extraDelay?: number) => void } | null = null;
    let pdfDoc: { destroy: () => Promise<void> } | null = null;

    void (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Worker URL — `new URL(..., import.meta.url)` 패턴으로 번들러(Next.js 의 webpack/turbopack)
        // 가 빌드 시 자동으로 worker 파일을 정적 자산에 포함하고 URL 을 생성. `public/` 복사가
        // 불필요해 lint 가 vendored minified 파일을 스캔하는 부수 효과(eslint 룰 위반 다수)도 회피.
        // `pdfjs-dist` 버전 변경 시 자동으로 일치하는 worker 가 사용된다.
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const res = await fetch(`/api/contents/${contentId}/files/${fileId}/download`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`download failed: status=${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        // Uint8Array 로 명시 — pdfjs-dist 가 ArrayBuffer 도 받지만 v5 권장은 TypedArray 형태.
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const pdf = await loadingTask.promise;
        pdfDoc = pdf;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 컨테이너(180×180) 안에 letterbox 없이 fit — PDF 가로/세로 비율에 맞춰 작은 쪽 기준 scale.
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(
          CONTAINER_SIZE / baseViewport.width,
          CONTAINER_SIZE / baseViewport.height,
        );
        const outputScale = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: fitScale });

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        // RenderParameters.transform 은 `any[] | undefined` — null 비호환. HiDPI 미적용 시 undefined 로 생략.
        const transform: [number, number, number, number, number, number] | undefined =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        // pdfjs-dist v5 권장 — `canvas` 파라미터 직접 전달 (canvasContext 는 backwards-compat).
        const task = page.render({
          canvas,
          viewport,
          transform,
        });
        renderTask = task;
        await task.promise;
      } catch (err) {
        if (cancelled) return;
        // RenderingCancelledException 은 cleanup 정상 흐름 — 로깅 제외.
        const name = err instanceof Error ? err.name : "";
        if (name === "RenderingCancelledException") return;
        console.error(`[PdfThumbnail] PDF 렌더링 실패: fileId=${fileId}`, err);
        onError(fileId);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void pdfDoc?.destroy();
    };
  }, [contentId, fileId, onError]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={fileName}
      className="max-w-full max-h-full object-contain"
    />
  );
}
