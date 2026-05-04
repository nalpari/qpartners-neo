"use client";

import dynamic from "next/dynamic";
import type { RichEditorProps } from "./rich-editor.types";
import { RichEditorSkeleton } from "./rich-editor-skeleton";

const DynamicRichEditor = dynamic<RichEditorProps>(
  () => import("./rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => <RichEditorSkeleton />,
  },
);

export function RichEditorLoader(props: RichEditorProps) {
  return <DynamicRichEditor {...props} />;
}
