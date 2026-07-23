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
 *   Link → <a href="…"> (툴바 🔗 버튼 + HTML 소스 모드 양쪽에서 입력 가능)
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
    // sanitize-html.ts SAFE_HREF_PATTERN(https?/mailto)과 동일한 스킴만 허용. (#은 서버 허용이나 autolink 비활성화로 불필요)
    // 클릭 시 편집 화면 이탈 방지 위해 openOnClick은 false — 링크 편집은 툴바 🔗 버튼/HTML 소스 모드로.
    // target: null — 기본값 _blank가 mergeAttributes로 강제 적용되지 않도록 명시 해제.
    // rel은 HTMLAttributes에 직접 명시. sanitize-html.ts afterSanitizeAttributes는 HTML 소스 모드 등
    // target=_blank 링크에 대한 추가 방어층으로 별도 동작.
    Link.configure({
      openOnClick: false,
      autolink: false,
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: { target: null, rel: "noopener noreferrer" },
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
