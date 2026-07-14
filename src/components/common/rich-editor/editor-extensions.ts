import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { InlineImagePaste } from "./inline-image-paste";
import { SlashCommand } from "./editor-slash-menu";
import { FontSize } from "./font-size";

export interface BuildExtensionsOptions {
  placeholder?: string;
  uploadInlineImage: (file: File) => Promise<string>;
  onUploadError: (error: unknown) => void;
  onUploadingChange: (uploading: boolean) => void;
  triggerImagePicker: () => void;
}

/**
 * RichEditor가 사용할 Tiptap extension 화이트리스트.
 *
 * 허용 블록(스펙 §6과 1:1 매핑):
 *   paragraph / heading L1~3 / bulletList / orderedList / blockquote / codeBlock /
 *   table / image (URL only)
 *
 * 인라인 마크 확장:
 *   TextStyle + Color  → <span style="color: …">
 *   Highlight(multicolor) → <mark style="background-color: …">
 *   Link → <a href="…"> (HTML 소스 모드 입력 보존용, 툴바 버튼은 미제공)
 *
 * 비활성: video / audio / file / pageBreak / taskList / taskItem
 *   - StarterKit·extension-table 등에 처음부터 포함되지 않거나 본 함수에서 추가하지 않음.
 *
 * StarterKit 부산물(HardBreak, History undo/redo, Bold/Italic/Strike/Code)은 그대로 활성.
 */
export function buildExtensions(opts: BuildExtensionsOptions) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "rich-editor-inline-image" },
    }),
    // sanitize-html.ts SAFE_HREF_PATTERN(https?/mailto/#)과 동일한 스킴만 허용.
    // 클릭 시 편집 화면 이탈 방지 위해 openOnClick은 false — 링크 편집은 HTML 소스 모드로만.
    Link.configure({
      openOnClick: false,
      autolink: false,
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: { rel: "noopener noreferrer" },
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: "rich-editor-table" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color.configure({ types: ["textStyle"] }),
    FontSize,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? "",
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
    InlineImagePaste.configure({
      upload: opts.uploadInlineImage,
      onError: opts.onUploadError,
      onUploadingChange: opts.onUploadingChange,
    }),
    SlashCommand.configure({
      triggerImagePicker: opts.triggerImagePicker,
    }),
  ];
}
