import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface InlineImagePasteOptions {
  /** File을 받아 업로드하고 결과 URL을 반환. 실패 시 reject. */
  upload: (file: File) => Promise<string>;
  /** 업로드 실패 시 호출 — 호출자에서 사용자 alert을 띄운다. */
  onError: (error: unknown) => void;
  /** 업로드 진행 중 여부 토글 — 호출자에서 외곽 1px progress 표시에 사용. */
  onUploadingChange: (uploading: boolean) => void;
}

const pluginKey = new PluginKey("inline-image-paste");

/**
 * paste/drop 이벤트에서 image File을 추출해 자동 업로드하는 ProseMirror plugin.
 *
 * 동작:
 *   1. paste/drop에서 image/* File 추출
 *   2. preventDefault — 브라우저 기본 동작 차단
 *   3. Promise.allSettled로 모든 업로드 시도 → 성공만 한 번에 insertContent
 *   4. 실패 분은 onError로 호출자에 전파
 *
 * 임시 placeholder 노드를 만들지 않으므로 onChange가 1회만 발생하고,
 * inline-image-cleanup이 임시 src를 잘못 수집할 위험이 0.
 */
export const InlineImagePaste = Extension.create<InlineImagePasteOptions>({
  name: "inlineImagePaste",

  addOptions() {
    return {
      upload: async () => "",
      onError: () => {},
      onUploadingChange: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { upload, onError, onUploadingChange } = this.options;
    const editor = this.editor;

    const handleFiles = async (files: File[]): Promise<void> => {
      onUploadingChange(true);
      try {
        const results = await Promise.allSettled(files.map(upload));
        const urls: string[] = [];
        for (const r of results) {
          if (r.status === "fulfilled") urls.push(r.value);
          else onError(r.reason);
        }
        if (urls.length > 0) {
          editor
            .chain()
            .focus()
            .insertContent(urls.map((src) => ({ type: "image", attrs: { src } })))
            .run();
        }
      } finally {
        onUploadingChange(false);
      }
    };

    return [
      new Plugin({
        key: pluginKey,
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const files = items
              .filter((it) => it.kind === "file")
              .map((it) => it.getAsFile())
              .filter((f): f is File => !!f && f.type.startsWith("image/"));
            if (files.length === 0) return false;
            event.preventDefault();
            void handleFiles(files);
            return true;
          },
          handleDrop(_view, event) {
            const dt = (event as DragEvent).dataTransfer;
            if (!dt) return false;
            const files = Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
            if (files.length === 0) return false;
            event.preventDefault();
            void handleFiles(files);
            return true;
          },
        },
      }),
    ];
  },
});
