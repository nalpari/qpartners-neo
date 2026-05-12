import { editorI18n } from "./editor-i18n";

export interface ColorOption {
  key: string;
  label: string;
  value: string;
}

const textColorPalette = editorI18n.toolbar.textColorPalette;
const highlightPalette = editorI18n.toolbar.highlightPalette;

export const TEXT_COLOR_PALETTE: readonly ColorOption[] = [
  { key: "red", label: textColorPalette.red, value: "#E03131" },
  { key: "orange", label: textColorPalette.orange, value: "#E8590C" },
  { key: "yellow", label: textColorPalette.yellow, value: "#F08C00" },
  { key: "green", label: textColorPalette.green, value: "#2F9E44" },
  { key: "teal", label: textColorPalette.teal, value: "#0CA678" },
  { key: "blue", label: textColorPalette.blue, value: "#1971C2" },
  { key: "indigo", label: textColorPalette.indigo, value: "#4263EB" },
  { key: "purple", label: textColorPalette.purple, value: "#7048E8" },
  { key: "gray", label: textColorPalette.gray, value: "#868E96" },
] as const;

export const HIGHLIGHT_PALETTE: readonly ColorOption[] = [
  { key: "yellow", label: highlightPalette.yellow, value: "#FFF3BF" },
  { key: "orange", label: highlightPalette.orange, value: "#FFD8A8" },
  { key: "red", label: highlightPalette.red, value: "#FFC9C9" },
  { key: "pink", label: highlightPalette.pink, value: "#FCC2D7" },
  { key: "purple", label: highlightPalette.purple, value: "#D0BFFF" },
  { key: "blue", label: highlightPalette.blue, value: "#A5D8FF" },
  { key: "teal", label: highlightPalette.teal, value: "#96F2D7" },
  { key: "green", label: highlightPalette.green, value: "#B2F2BB" },
  { key: "gray", label: highlightPalette.gray, value: "#DEE2E6" },
] as const;
