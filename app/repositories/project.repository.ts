import { db } from "./db";
import { projectSchema, type Project, type ProjectInput } from "~/models/project";
import { uuid } from "~/lib/id";
import { generateKeyBetween } from "~/lib/fractional-index";
import { seedUsers } from "~/auth/session";

function validate(row: unknown): Project {
  return projectSchema.parse(row);
}

export const DEFAULT_COLUMNS = [
  { id: "todo", name: "待办", isDone: false, order: 0 },
  { id: "doing", name: "进行中", isDone: false, order: 1 },
  { id: "verify", name: "待验证", isDone: false, order: 2 },
  { id: "done", name: "已完成", isDone: true, order: 3 },
];

export const projectRepository = {
  async list(): Promise<Project[]> {
    const rows = await db.projects.orderBy("updatedAt").reverse().toArray();
    return rows.filter((r) => r.deletedAt === null).map(validate);
  },

  async listDeleted(): Promise<Project[]> {
    const rows = await db.projects.toArray();
    return rows.filter((r) => r.deletedAt !== null).map(validate);
  },

  async get(id: string): Promise<Project | undefined> {
    const row = await db.projects.get(id);
    return row ? validate(row) : undefined;
  },

  async create(input: Omit<ProjectInput, "createdAt" | "updatedAt" | "version">): Promise<Project> {
    const now = new Date().toISOString();
    const project = validate({
      ...input,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    await db.projects.add(project);
    return project;
  },

  async createDemo(): Promise<Project> {
    const now = new Date().toISOString();
    const users = await seedUsers(["张三", "李四", "王五"]);
    const project = await this.create({
      id: uuid(),
      name: "演示项目",
      description: "ProjectHub 演示数据",
      statusColumns: DEFAULT_COLUMNS.map((c) => ({ ...c, id: uuid() })),
      ownerId: users[0]!.id,
      memberRoles: {
        [users[0]!.id]: "admin",
        [users[1]!.id]: "member",
        [users[2]!.id]: "guest",
      },
    });
    const colName = (i: number) => project.statusColumns[i]!.id;
    const demos: [string, number][] = [
      ["设计看板组件结构", 0],
      ["实现拖拽排序交互", 1],
      ["接入 IndexedDB 存储", 2],
      ["搭建项目骨架", 3],
    ];
    let prevKey: string | null = null;
    for (const [title, col] of demos) {
      const order = generateKeyBetween(prevKey, null);
      prevKey = order;
      await db.tasks.add({
        id: uuid(),
        projectId: project.id,
        title,
        descriptionRich: null,
        status: colName(col),
        assigneeId: null,
        startDate: null,
        dueDate: null,
        customValues: {},
        priority: "medium",
        labels: [],
        subtasks: [],
        recurrence: "none",
        order,
        archived: false,
        // 落在完成列的演示任务带完成时间，统计口径一致
        completedAt: col === 3 ? now : null,
        deletedAt: null,
        deletedByProjectId: null,
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
    }
    return project;
  },
};
