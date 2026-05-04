import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

/**
 * 콘텐츠 본문 에디터에서 허용할 BlockNote 블록 목록.
 * - heading (levels 1~3) / paragraph
 * - bulletListItem / numberedListItem / checkListItem
 * - quote / codeBlock / table / image (URL only)
 *
 * 비활성: video / audio / file / pageBreak (스코프 제외)
 *
 * BlockNote는 schema에 등록된 블록만 슬래시 메뉴·사이드 메뉴에 노출하므로
 * 별도 메뉴 필터 코드는 불필요하다.
 */
export const allowedBlocksSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    table: defaultBlockSpecs.table,
    image: defaultBlockSpecs.image,
  },
});
