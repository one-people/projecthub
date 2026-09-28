// 数据配色调色板：状态列色点（看板）与姓名头像色（多处共用）的确定性取色
export const PALETTE = [
  "#3F3F46", "#0F766E", "#B45309", "#7C3AED",
  "#BE185D", "#4F46E5", "#4D7C0F", "#9A3412",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function statusColor(columnId: string): string {
  return PALETTE[hash(columnId) % PALETTE.length]!;
}

export function avatarColor(name: string): string {
  return PALETTE[hash(name) % PALETTE.length]!;
}
