// 数据调色板（Data Palettes）— 用户可见颜色但非主题色：
// 与 tokens.css 的语义 Token 不同，这里的色值是「业务数据」的一部分
// （按 id 稳定取色、优先级点色等），不随明暗主题切换。
// 仅允许在 lib/ 的调色板模块中出现色值字面量（docs/standards/01-ui-spec §6）。

/** 项目卡片角块配色：按项目 id 稳定取色（靛蓝为主的 8 色） */
const TILE_COLORS = [
  "#4f46e5",
  "#0284c7",
  "#059669",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#0d9488",
  "#db2777",
] as const;

export function tileColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length]!;
}
