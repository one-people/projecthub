import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { TaskLink } from "~/models/taskLink";

/** 关联操作的业务错误码（调用方按 i18n key 提示） */
export type LinkErrorCode = "self" | "exists" | "cycle";
export class LinkError extends Error {
  constructor(public code: LinkErrorCode) {
    super(code);
  }
}

/** blocks 边构成的有向图里，from 是否已经能沿“阻塞”关系走到 to（再加 from→to 会成环） */
function reaches(links: TaskLink[], from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (l.type !== "blocks") continue;
    adj.set(l.fromTaskId, [...(adj.get(l.fromTaskId) ?? []), l.toTaskId]);
  }
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    queue.push(...(adj.get(cur) ?? []));
  }
  return false;
}

export const taskLinkService = {
  list(projectId: string): Promise<TaskLink[]> {
    return db.taskLinks.where("projectId").equals(projectId).toArray();
  },

  /**
   * 添加关联。任意两个任务之间最多一条关联（不分方向与类型）；
   * blocks 类型额外做成环检测，防止 A→B→C→A 的循环依赖。
   */
  async add(input: {
    projectId: string;
    fromTaskId: string;
    toTaskId: string;
    type: TaskLink["type"];
  }): Promise<TaskLink> {
    if (input.fromTaskId === input.toTaskId) throw new LinkError("self");
    const links = await this.list(input.projectId);
    const pairExists = links.some(
      (l) =>
        (l.fromTaskId === input.fromTaskId && l.toTaskId === input.toTaskId) ||
        (l.fromTaskId === input.toTaskId && l.toTaskId === input.fromTaskId),
    );
    if (pairExists) throw new LinkError("exists");
    if (input.type === "blocks" && reaches(links, input.toTaskId, input.fromTaskId)) {
      throw new LinkError("cycle");
    }
    const link: TaskLink = { id: uuid(), ...input, createdAt: new Date().toISOString() };
    await db.taskLinks.add(link);
    return link;
  },

  async remove(id: string): Promise<void> {
    await db.taskLinks.delete(id);
  },

  /** 任务被彻底删除时，清掉与它相连的所有关联 */
  async stripTask(taskId: string): Promise<void> {
    await db.transaction("rw", db.taskLinks, async () => {
      await db.taskLinks.where("fromTaskId").equals(taskId).delete();
      await db.taskLinks.where("toTaskId").equals(taskId).delete();
    });
  },
};
