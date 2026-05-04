"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { editorI18n, type SlashItemKey } from "./editor-i18n";

// ============================================================================
// 메뉴 항목 정의
// ============================================================================

interface SlashItem {
  key: SlashItemKey;
  title: string;
  keywords: readonly string[];
  command: (args: { editor: Editor; range: Range }) => void;
}

function buildItems(triggerImagePicker: () => void): SlashItem[] {
  const i = editorI18n.slash.items;
  return [
    {
      key: "paragraph",
      title: i.paragraph.title,
      keywords: i.paragraph.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
    },
    {
      key: "heading1",
      title: i.heading1.title,
      keywords: i.heading1.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      key: "heading2",
      title: i.heading2.title,
      keywords: i.heading2.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      key: "heading3",
      title: i.heading3.title,
      keywords: i.heading3.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      key: "bulletList",
      title: i.bulletList.title,
      keywords: i.bulletList.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      key: "orderedList",
      title: i.orderedList.title,
      keywords: i.orderedList.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      key: "blockquote",
      title: i.blockquote.title,
      keywords: i.blockquote.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      key: "codeBlock",
      title: i.codeBlock.title,
      keywords: i.codeBlock.keywords,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      key: "image",
      title: i.image.title,
      keywords: i.image.keywords,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        triggerImagePicker();
      },
    },
    {
      key: "table",
      title: i.table.title,
      keywords: i.table.keywords,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];
}

function filterItems(query: string, all: SlashItem[]): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q)),
  );
}

// ============================================================================
// MenuList — tippy 안에 렌더되는 React 컴포넌트
// ============================================================================

interface MenuListHandle {
  onKeyDown: (e: { event: KeyboardEvent }) => boolean;
}

interface MenuListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const MenuList = forwardRef<MenuListHandle, MenuListProps>(function MenuList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);
  // items가 변경되면 선택 인덱스를 유효 범위로 클램핑 (set-state-in-effect 금지 → 파생 값 사용)
  const safeSelected = Math.min(selected, Math.max(items.length - 1, 0));

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[safeSelected]) command(items[safeSelected]);
          return true;
        }
        return false;
      },
    }),
    [items, safeSelected, command],
  );

  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#EBEBEB] rounded-[6px] shadow-md py-2 px-3 font-['Noto_Sans_JP'] text-[13px] text-[#999]">
        {editorI18n.slash.empty}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EBEBEB] rounded-[6px] shadow-md py-1 font-['Noto_Sans_JP'] text-[14px] text-[#101010] min-w-[200px] max-h-[280px] overflow-y-auto">
      {items.map((item, idx) => (
        <button
          key={item.key}
          type="button"
          onClick={() => command(item)}
          onMouseEnter={() => setSelected(idx)}
          className={`block w-full text-left px-3 py-2 transition-colors ${
            idx === safeSelected ? "bg-[#F4F4F4]" : "bg-transparent"
          }`}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// SlashCommand — Tiptap extension
// ============================================================================

export interface SlashCommandOptions {
  /** 슬래시 메뉴에서 画像 항목을 골랐을 때 호출. 호출자가 file picker를 띄운다. */
  triggerImagePicker: () => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      triggerImagePicker: () => {},
    };
  },

  addProseMirrorPlugins() {
    const triggerImagePicker = this.options.triggerImagePicker;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) => filterItems(query, buildItems(triggerImagePicker)).slice(0, 10),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<MenuListHandle, MenuListProps> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(MenuList, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                // Suggestion API는 () => DOMRect | null, tippy는 () => DOMRect를 기대 →
                // null 케이스를 빈 0×0 rect로 폴백해 타입 일치.
                getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                arrow: false,
              });
            },
            onUpdate(props) {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              });
              if (props.clientRect) {
                popup?.[0]?.setProps({
                  getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                });
              }
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
