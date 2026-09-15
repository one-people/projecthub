import { describe, expect, it } from "vitest";
import { applyFilters, applySort } from "~/lib/list-query";
import { EMPTY_FILTERS, type Filters } from "~/components/list/FilterBar";
import type { Task } from "~/models/task";

function task(patch: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "p1",
    title: "任务",
    descriptionRich: null,
    status: "todo",
    assigneeId: null,
    dueDate: null,
    priority: "none",
    labels: [],
    subtasks: [],
    order: "a0",
    archived: false,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 0,
    ...patch,
  };
}

const yesterday = new Date(Date.now() - 86400000).toISOString();
const tomorrow = new Date(Date.now() + 86400000).toISOString();

describe("applyFilters", () => {
  const tasks = [
    task({ id: "1", assigneeId: "u1", priority: "urgent", dueDate: yesterday }),
    task({ id: "2", assigneeId: "u2", priority: "low", dueDate: tomorrow }),
    task({ id: "3", completedAt: tomorrow, dueDate: yesterday }),
    task({ id: "4", archived: true }),
  ];

  it("无过滤返回全部未归档任务", () => {
    expect(applyFilters(tasks, EMPTY_FILTERS).map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("按负责人筛选", () => {
    const f: Filters = { ...EMPTY_FILTERS, assigneeId: "u2" };
    expect(applyFilters(tasks, f).map((t) => t.id)).toEqual(["2"]);
  });

  it("已逾期排除已完成与无日期任务", () => {
    const f: Filters = { ...EMPTY_FILTERS, due: "overdue" };
    expect(applyFilters(tasks, f).map((t) => t.id)).toEqual(["1"]);
  });

  it("无日期筛选", () => {
    const withNone = [...tasks, task({ id: "5", dueDate: null })];
    const f: Filters = { ...EMPTY_FILTERS, due: "none" };
    expect(applyFilters(withNone, f).map((t) => t.id)).toEqual(["5"]);
  });

  it("状态筛选：未完成", () => {
    const f: Filters = { ...EMPTY_FILTERS, status: "open" };
    expect(applyFilters(tasks, f).map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("applySort", () => {
  it("按优先级排序（紧急在前）", () => {
    const tasks = [
      task({ priority: "low", title: "B" }),
      task({ priority: "urgent", title: "A" }),
      task({ priority: "medium", title: "C" }),
    ];
    const sorted = applySort(tasks, { field: "priority", direction: "asc" });
    expect(sorted.map((t) => t.title)).toEqual(["A", "C", "B"]);
  });

  it("无截止日期排最后（升序）", () => {
    const tasks = [
      task({ title: "无日期", dueDate: null }),
      task({ title: "明天", dueDate: tomorrow }),
    ];
    const sorted = applySort(tasks, { field: "dueDate", direction: "asc" });
    expect(sorted.map((t) => t.title)).toEqual(["明天", "无日期"]);
  });

  it("标题中文排序", () => {
    const tasks = [task({ title: "任务乙" }), task({ title: "任务甲" })];
    const sorted = applySort(tasks, { field: "title", direction: "asc" });
    expect(sorted[0]!.title).toBe("任务甲");
  });
});
