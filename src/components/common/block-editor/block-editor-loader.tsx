"use client";

import dynamic from "next/dynamic";
import type { BlockEditorProps } from "./block-editor.types";
import { BlockEditorSkeleton } from "./block-editor-skeleton";

const DynamicBlockEditor = dynamic<BlockEditorProps>(
  () => import("./block-editor").then((m) => m.BlockEditor),
  {
    ssr: false,
    loading: () => <BlockEditorSkeleton />,
  },
);

export function BlockEditorLoader(props: BlockEditorProps) {
  return <DynamicBlockEditor {...props} />;
}
