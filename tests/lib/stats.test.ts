import { describe, expect, it } from "vitest";
import {
  computeBurndown,
  computePriorityDistribution,
  computeStatusDistribution,
  computeTrend,
  computeWorkload,
} from "~/lib/stats";
import type { Task } from "~/models/task";
import type { StatusColumn } from "~/models/project";
import type { User } from "~/models/user";

function task(patch: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "p1",
    parentId: null,
    title: "任务",
    descriptionRich: null,
    status: "todo",
    assigneeId: null,
    startDate: null,
    dueDate: null,
    customValues: {},
    priority: "none",
    labels: [],
    subtasks: [],
    recurrence: "none",
    order: "a0",
    archived: false,
    completedAt: null,
    deletedAt: null,
    deletedByProjectId: null, deletedByParentTaskId: null,
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: "2026-09-20T08:00:00.000Z",
    version: 0,
    ...patch,
  };
}

const users: User[] = [
  { id: "u1", name: "张三", avatarColor: "#111", createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z", version: 0 } as unknown as User,
  { id: "u2", name: "李四", avatarColor: "#222", createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z", version: 0 } as unknown as User,
];

const columns: StatusColumn[] = [
  { id: "todo", name: "待办", isDone: false, order: 0 },
  { id: "doing", name: "进行中", isDone: false, order: 1 },
  { id: "done", name: "已完成", isDone: true, order: 2 },
];

describe("computeBurndown", () => {
  it("逐日累计：创建+完成，剩余=已创建−已完成；截止今天", () => {
    const pts = computeBurndown([
      task({ createdAt: "2026-09-20T08:00:00.000Z" }),
      task({ createdAt: "2026-09-21T08:00:00.000Z", completedAt: "2026-09-22T08:00:00.000Z" }),
    ], "2026-09-23");
    expect(pts).toHaveLength(4); // 20 21 22 23
    expect(pts[0]).toMatchObject({ day: "2026-09-20", created: 1, completed: 0, remaining: 1 });
    expect(pts[2]).toMatchObject({ created: 2, completed: 1, remaining: 1 });
    expect(pts[3]!.remaining).toBe(1);
  });

  it("软删任务不参与；空任务返回空数组", () => {
    expect(computeBurndown([], "2026-09-23")).toEqual([]);
    const pts = computeBurndown([task({ deletedAt: "2026-09-21T00:00:00.000Z" })], "2026-09-23");
    expect(pts).toEqual([]);
  });
});

describe("computeWorkload", () => {
  it("按成员统计未完成/已完成，未指派单独一行，按未完成降序", () => {
    const rows = computeWorkload([
      task({ assigneeId: "u1" }),
      task({ assigneeId: "u1", completedAt: "2026-09-22T08:00:00.000Z" }),
      task({ assigneeId: "u2", completedAt: "2026-09-22T08:00:00.000Z" }),
      task({ assigneeId: null }),
    ], users);
    expect(rows[0]).toMatchObject({ name: "张三", open: 1, done: 1 });
    expect(rows.find((r) => r.name === "李四")).toMatchObject({ open: 0, done: 1 });
    expect(rows.find((r) => r.userId === "")).toMatchObject({ open: 1, done: 0 });
  });
});

describe("computeTrend", () => {
  it("最近 8 周，按完成周归类，窗口外忽略", () => {
    // 2026-09-28 是周一；本周完成 2，上周完成 1
    const weeks = computeTrend([
      task({ completedAt: "2026-09-28T10:00:00.000Z" }),
      task({ completedAt: "2026-09-29T10:00:00.000Z" }),
      task({ completedAt: "2026-09-24T10:00:00.000Z" }),
      task({ completedAt: "2026-01-01T10:00:00.000Z" }), // 窗口外
    ], "2026-09-30");
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({ weekStart: "2026-09-28", completed: 2 });
    expect(weeks[6]!.weekStart).toBe("2026-09-21");
    expect(weeks[6]!.completed).toBe(1);
  });
});

describe("distributions", () => {
  it("状态按列顺序计数", () => {
    const slices = computeStatusDistribution(
      [task({ status: "todo" }), task({ status: "todo" }), task({ status: "done", completedAt: "x" })],
      columns,
    );
    expect(slices.map((s) => `${s.name}:${s.count}`)).toEqual(["待办:2", "进行中:0", "已完成:1"]);
  });

  it("优先级按 urgent→none 顺序", () => {
    const slices = computePriorityDistribution([task({ priority: "high" }), task({ priority: "none" })]);
    expect(slices.map((s) => `${s.priority}:${s.count}`)).toEqual([
      "urgent:0", "high:1", "medium:0", "low:0", "none:1",
    ]);
  });
});
