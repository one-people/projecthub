// 扫描 TipTap 文档 JSON 中的 mention 节点，提取被 @ 的 userId（去重）
export function extractMentionIds(doc: unknown): string[] {
  const ids = new Set<string>();

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const n = node as { type?: string; attrs?: { id?: unknown } };
      if (n.type === "mention" && typeof n.attrs?.id === "string") {
        ids.add(n.attrs.id);
      }
      Object.values(n).forEach(walk);
    }
  }

  walk(doc);
  return [...ids];
}
