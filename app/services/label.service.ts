import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import { LABEL_COLORS, type Label } from "~/models/label";

function nextColor(existing: Label[]): string {
  const used = new Set(existing.map((l) => l.color));
  const free = LABEL_COLORS.find((c) => !used.has(c));
  return free ?? LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)]!;
}

export const labelService = {
  list(projectId: string): Promise<Label[]> {
    return db.labels.where("projectId").equals(projectId).toArray();
  },

  async create(projectId: string, name: string, color?: string): Promise<Label> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("标签名称不能为空");
    const existing = await this.list(projectId);
    if (existing.some((l) => l.name === trimmed)) {
      throw new Error("同名标签已存在");
    }
    const label: Label = {
      id: uuid(),
      projectId,
      name: trimmed,
      color: color ?? nextColor(existing),
      createdAt: new Date().toISOString(),
    };
    await db.labels.add(label);
    return label;
  },

  async update(id: string, patch: Partial<Pick<Label, "name" | "color">>): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) {
      throw new Error("标签名称不能为空");
    }
    await db.labels.update(id, {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    });
  },

  /** 删除标签并从所有任务的 labels 数组中剥离（事务内原子完成） */
  async remove(id: string): Promise<void> {
    await db.transaction("rw", db.labels, db.tasks, async () => {
      await db.labels.delete(id);
      await db.tasks
        .filter((t) => t.labels.includes(id))
        .modify((t) => {
          t.labels = t.labels.filter((l) => l !== id);
        });
    });
  },
};
