import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
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
