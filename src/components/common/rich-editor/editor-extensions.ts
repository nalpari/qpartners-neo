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
import Youtube from "@tiptap/extension-youtube";
import { nodePasteRule } from "@tiptap/core";
import { SAFE_YOUTUBE_SRC_PATTERN } from "@/lib/rich-editor/sanitize-html";
import { InlineImagePaste } from "./inline-image-paste";
import { SlashCommand } from "./editor-slash-menu";
import { FontSize } from "./font-size";

/**
 * 붙여넣기로 임베드 전환할 YouTube "동영상" URL 패턴.
 *
 * 확장의 기본 paste 규칙(YOUTUBE_REGEX)은 도메인만 맞으면 전부 소비해서,
 * `/results?search_query=…`, `/feed/subscriptions` 처럼 **비디오 ID 가 없는 URL** 까지
 * youtube 노드로 바꾼다. 그런데 renderHTML 의 embed URL 생성은 그 경우 null 을 돌려주므로
 * src 없는 iframe 이 되고, sanitize 가 그걸 걷어내면서 붙여넣은 URL 이 통째로 사라진다.
 *
 * 그래서 embed URL 을 확실히 만들 수 있는 형태 — watch?v= / shorts / live / embed /
 * youtu.be — 에 11자 비디오 ID 가 붙은 경우만 매칭한다. 그 외 YouTube URL 은
 * 규칙이 매칭되지 않아 평소처럼 텍스트로 남는다.
 */
const YOUTUBE_VIDEO_URL_PASTE_PATTERN =
  /https?:\/\/(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s&]*&)*v=|embed\/|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}(?![A-Za-z0-9_-])\S*/g;

/**
 * Youtube 확장의 parseHTML 보강.
 *
 * 기본 규칙은 `div[data-youtube-video] iframe` 하나뿐이라, 자신이 직렬화한 마크업만 되읽는다.
 * 그런데 YouTube 「공유 > 퍼가기」가 주는 코드는 래퍼 div 없는 **단독 `<iframe>`** 이라
 * HTML 소스 모드에 붙여넣으면 sanitize 는 통과해도 ProseMirror 가 매칭 노드를 못 찾아
 * 통째로 버린다 (= 본문에 아무것도 안 들어감).
 *
 * 그래서 단독 iframe 도 파싱하도록 규칙을 하나 더 얹는다. src 판정은 sanitize 와 같은
 * 패턴을 써서, "sanitize 는 통과했는데 에디터는 거부" 하는 어긋남이 생기지 않게 한다.
 * DB 에 이미 단독 iframe 으로 저장된 본문을 수정 화면에서 다시 열 때도 이 규칙이 받는다.
 */
const YoutubeEmbed = Youtube.extend({
  /**
   * 기본 paste 규칙 대체 — base 의 addPasteHandler 경로는 더 이상 타지 않는다.
   * src 로 match[0](매칭된 URL)만 쓰는 것도 의도적. base 는 match.input, 즉 붙여넣은
   * 문자열 전체를 src 에 넣어 URL 앞뒤에 다른 텍스트가 섞이면 그대로 깨진다.
   */
  addPasteRules() {
    return [
      nodePasteRule({
        find: YOUTUBE_VIDEO_URL_PASTE_PATTERN,
        type: this.type,
        getAttributes: (match) => ({ src: match[0] }),
      }),
    ];
  },

  parseHTML() {
    return [
      { tag: "div[data-youtube-video] iframe" },
      {
        tag: "iframe[src]",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const src = element.getAttribute("src") ?? "";
          if (!SAFE_YOUTUBE_SRC_PATTERN.test(src)) return false;
          // 퍼가기 코드의 width/height 를 그대로 승계 (없거나 비정상이면 configure 기본값).
          const width = Number(element.getAttribute("width"));
          const height = Number(element.getAttribute("height"));
          return {
            src,
            ...(Number.isInteger(width) && width > 0 ? { width } : {}),
            ...(Number.isInteger(height) && height > 0 ? { height } : {}),
          };
        },
      },
    ];
  },
});

export interface BuildExtensionsOptions {
  placeholder?: string;
  uploadInlineImage: (file: File) => Promise<string>;
  onUploadError: (error: unknown) => void;
  onUploadingChange: (uploading: boolean) => void;
  triggerImagePicker: () => void;
  /** YouTube 임베드 노드 등록 여부 (기본 false). 대량메일 폼에서는 꺼둔다. */
  allowYoutubeEmbed?: boolean;
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
 * 임베드:
 *   Youtube → <div data-youtube-video><iframe …></div>
 *     sanitize-html.ts 는 iframe 을 기본 차단하므로, 이 노드가 살아남으려면 렌더/소스적용
 *     경로가 `allowYoutubeEmbed: true` 로 sanitize 해야 한다 (메일 경로는 계속 차단).
 *
 * 비활성: video / audio / file / pageBreak / taskList / taskItem
 *   - StarterKit·extension-table 등에 처음부터 포함되지 않거나 본 함수에서 추가하지 않음.
 *
 * StarterKit 부산물(HardBreak, History undo/redo, Bold/Italic/Strike/Code)은 그대로 활성.
 */
export function buildExtensions(opts: BuildExtensionsOptions) {
  // 옵션이 꺼져 있으면 노드 자체를 등록하지 않는다 — 붙여넣기 임베드도 생기지 않고,
  // 기존 본문에 iframe 이 있어도 파싱되지 않아 메일 폼에서는 표시/편집 대상이 되지 않는다.
  const youtubeExtensions = opts.allowYoutubeEmbed
    ? [
        // YouTube 임베드 — <div data-youtube-video><iframe src="…/embed/{id}"></iframe></div>
        //
        // 삽입 경로 2가지 (별도 UI 없음):
        //   1. 에디터에 YouTube **동영상** URL 붙여넣기 → 위 addPasteRules 가 임베드로 변환.
        //      비디오 ID 가 없는 YouTube URL(검색/피드/채널 등)은 매칭되지 않아 텍스트로 남는다.
        //      Link.autolink=false 라 URL 이 링크로 먼저 잡히는 충돌이 없고,
        //      InlineImagePaste 는 이미지 파일이 아니면 false 를 반환해 이 핸들러로 넘어온다.
        //   2. HTML 소스 모드에 YouTube 퍼가기 코드(iframe) 붙여넣기 → sanitize 통과 후 파싱.
        //
        // nocookie: youtube-nocookie.com 도메인 사용 (재생 전 쿠키 미설정).
        // sanitize-html.ts SAFE_YOUTUBE_SRC_PATTERN 은 두 도메인을 모두 허용한다.
        YoutubeEmbed.configure({
          nocookie: true,
          controls: true,
          allowFullscreen: true,
          width: 640,
          height: 360,
          HTMLAttributes: { class: "rich-editor-youtube" },
        }),
      ]
    : [];

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "rich-editor-inline-image" },
    }),
    // sanitize-html.ts SAFE_HREF_PATTERN은 https?/mailto/# 을 허용하나, 에디터 클라이언트 측은
    // autolink 비활성화로 # 입력 경로가 없으므로 protocols에서 제외.
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
    ...youtubeExtensions,
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
