import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { Locale } from "~/lib/i18n";
import {
  projectTemplateSchema,
  type ProjectTemplate,
  type ProjectTemplateTask,
} from "~/models/projectTemplate";
import type { Project } from "~/models/project";
import type { Label } from "~/models/label";

type Bi = { zh: string; en: string };

interface BuiltinDef {
  id: string;
  name: Bi;
  description: Bi;
  columns: { name: Bi; isDone: boolean }[];
  labels: { name: Bi; color: string }[];
  taskTemplates: { name: Bi; title: Bi; subtasks: { title: Bi }[] }[];
}

const bi = (v: Bi, locale: Locale) => (locale === "en" ? v.en : v.zh);

/** 内置模板：研发迭代 / 营销活动 / 内容计划（Worktile 式起步结构） */
export const BUILTIN_DEFS: BuiltinDef[] = [
  {
    id: "tpl-builtin-rd",
    name: { zh: "研发迭代", en: "R&D Sprint" },
    description: { zh: "需求 → 开发 → 验证 → 发布的标准研发流", en: "The standard flow from idea to release" },
    columns: [
      { name: { zh: "待办", en: "To do" }, isDone: false },
      { name: { zh: "进行中", en: "In progress" }, isDone: false },
      { name: { zh: "待验证", en: "In review" }, isDone: false },
      { name: { zh: "已完成", en: "Done" }, isDone: true },
    ],
    labels: [
      { name: { zh: "设计", en: "Design" }, color: "#7C3AED" },
      { name: { zh: "前端", en: "Frontend" }, color: "#0EA5E9" },
      { name: { zh: "后端", en: "Backend" }, color: "#059669" },
      { name: { zh: "测试", en: "QA" }, color: "#D97706" },
    ],
    taskTemplates: [
      {
        name: { zh: "需求评审", en: "Requirement review" },
        title: { zh: "需求评审", en: "Requirement review" },
        subtasks: [
          { title: { zh: "整理需求要点", en: "Collect requirement notes" } },
          { title: { zh: "组织评审会议", en: "Run the review meeting" } },
          { title: { zh: "记录评审结论", en: "Write up conclusions" } },
        ],
      },
      {
        name: { zh: "缺陷修复", en: "Bug fix" },
        title: { zh: "缺陷修复", en: "Bug fix" },
        subtasks: [
          { title: { zh: "复现问题", en: "Reproduce the issue" } },
          { title: { zh: "定位原因", en: "Find the root cause" } },
          { title: { zh: "验证修复", en: "Verify the fix" } },
        ],
      },
    ],
  },
  {
    id: "tpl-builtin-marketing",
    name: { zh: "营销活动", en: "Marketing Campaign" },
    description: { zh: "策划、制作、投放到复盘的活动管理", en: "Plan, produce, launch and review campaigns" },
    columns: [
      { name: { zh: "策划", en: "Planning" }, isDone: false },
      { name: { zh: "制作", en: "Production" }, isDone: false },
      { name: { zh: "投放", en: "Launch" }, isDone: false },
      { name: { zh: "复盘", en: "Retrospective" }, isDone: true },
    ],
    labels: [
      { name: { zh: "内容", en: "Content" }, color: "#DB2777" },
      { name: { zh: "渠道", en: "Channel" }, color: "#0F766E" },
      { name: { zh: "设计", en: "Design" }, color: "#7C3AED" },
    ],
    taskTemplates: [
      {
        name: { zh: "活动策划案", en: "Campaign brief" },
        title: { zh: "活动策划案", en: "Campaign brief" },
        subtasks: [
          { title: { zh: "目标与预算", en: "Goals and budget" } },
          { title: { zh: "方案初稿", en: "Draft proposal" } },
          { title: { zh: "终稿确认", en: "Final approval" } },
        ],
      },
      {
        name: { zh: "渠道投放", en: "Channel launch" },
        title: { zh: "渠道投放", en: "Channel launch" },
        subtasks: [
          { title: { zh: "素材准备", en: "Prepare assets" } },
          { title: { zh: "排期确认", en: "Confirm the schedule" } },
          { title: { zh: "数据回收", en: "Collect results" } },
        ],
      },
    ],
  },
  {
    id: "tpl-builtin-content",
    name: { zh: "内容计划", en: "Content Plan" },
    description: { zh: "选题、撰写、发布的内容流水线", en: "A pipeline from topics to publishing" },
    columns: [
      { name: { zh: "选题", en: "Topics" }, isDone: false },
      { name: { zh: "撰写", en: "Writing" }, isDone: false },
      { name: { zh: "发布", en: "Publishing" }, isDone: false },
      { name: { zh: "已发布", en: "Published" }, isDone: true },
    ],
    labels: [
      { name: { zh: "文章", en: "Article" }, color: "#4F46E5" },
      { name: { zh: "视频", en: "Video" }, color: "#DC2626" },
    ],
    taskTemplates: [
      {
        name: { zh: "文章撰写", en: "Article writing" },
        title: { zh: "文章撰写", en: "Article writing" },
        subtasks: [
          { title: { zh: "选题确认", en: "Confirm the topic" } },
          { title: { zh: "完成初稿", en: "Finish the draft" } },
          { title: { zh: "配图与发布", en: "Artwork and publish" } },
        ],
      },
    ],
  },
];

function builtinToTemplate(def: BuiltinDef, locale: Locale): ProjectTemplate {
  return projectTemplateSchema.parse({
    id: def.id,
    name: bi(def.name, locale),
    description: bi(def.description, locale),
    builtin: true,
    columns: def.columns.map((c) => ({ name: bi(c.name, locale), isDone: c.isDone })),
    labels: def.labels.map((l) => ({ name: bi(l.name, locale), color: l.color })),
    customFields: [],
    taskTemplates: def.taskTemplates.map((tt) => ({
      name: bi(tt.name, locale),
      title: bi(tt.title, locale),
      descriptionRich: null,
      priority: "none",
      subtasks: tt.subtasks.map((s) => ({ title: bi(s.title, locale) })),
      labels: [],
      recurrence: "none",
    })),
    createdAt: "",
  });
}

/** 空白项目：两列起步 */
export function blankTemplate(locale: Locale): ProjectTemplate {
  const en = locale === "en";
  return projectTemplateSchema.parse({
    id: "tpl-blank",
    name: en ? "Blank project" : "空白项目",
    description: en ? "Start with a basic two-column board" : "从基础两列看板开始",
    builtin: true,
    columns: [
      { name: en ? "To do" : "待办", isDone: false },
      { name: en ? "Done" : "已完成", isDone: true },
    ],
    labels: [],
    customFields: [],
    taskTemplates: [],
    createdAt: "",
  });
}

export const projectTemplateService = {
  /** 内置 + 已保存模板（内置在前，按名称排序） */
  async list(locale: Locale): Promise<ProjectTemplate[]> {
    const saved = (await db.projectTemplates.toArray())
      .map((row) => projectTemplateSchema.parse(row))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [blankTemplate(locale), ...BUILTIN_DEFS.map((d) => builtinToTemplate(d, locale)), ...saved];
  },

  /** 把现有项目快照为模板（列/标签/自定义字段/本项目任务模板） */
  async createFromProject(project: Project, name: string): Promise<ProjectTemplate> {
    const trimmed = name.trim() || project.name;
    const [labels, taskTpls] = await Promise.all([
      db.labels.where("projectId").equals(project.id).toArray(),
      db.taskTemplates.where("projectId").equals(project.id).toArray(),
    ]);
    const labelNameById = new Map(labels.map((l) => [l.id, l.name]));
    const row = projectTemplateSchema.parse({
      id: uuid(),
      name: trimmed,
      description: project.description,
      builtin: false,
      columns: [...project.statusColumns]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ name: c.name, isDone: c.isDone })),
      labels: labels.map((l) => ({ name: l.name, color: l.color })),
      customFields: project.customFields.map((f) => ({ ...f, id: uuid() })),
      taskTemplates: taskTpls.map((tt) => ({
        name: tt.name,
        title: tt.title,
        descriptionRich: tt.descriptionRich,
        priority: tt.priority,
        subtasks: tt.subtasks,
        labels: tt.labels.map((id) => labelNameById.get(id)).filter((n): n is string => Boolean(n)),
        recurrence: tt.recurrence,
      })),
      createdAt: new Date().toISOString(),
    });
    await db.projectTemplates.add(row);
    return row;
  },

  /** 由模板创建项目：列/标签/自定义字段 id 全部重新生成，任务模板落到新项目 */
  async instantiate(template: ProjectTemplate, name: string, actorId: string): Promise<Project> {
    const trimmed = name.trim() || template.name;
    const now = new Date().toISOString();
    const project: Project = {
      id: uuid(),
      name: trimmed,
      description: template.builtin ? "" : template.description,
      statusColumns: template.columns.map((c, i) => ({ id: uuid(), name: c.name, isDone: c.isDone, order: i })),
      customFields: template.customFields.map((f) => ({ ...f, id: uuid() })),
      ownerId: actorId,
      memberRoles: { [actorId]: "admin" },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };
    const labelRows: Label[] = template.labels.map((l) => ({
      id: uuid(),
      projectId: project.id,
      name: l.name,
      color: l.color,
      createdAt: now,
    }));
    const labelIdByName = new Map(labelRows.map((l) => [l.name, l.id]));
    const tplRows = template.taskTemplates.map((tt: ProjectTemplateTask) => ({
      id: uuid(),
      projectId: project.id,
      name: tt.name || tt.title,
      title: tt.title,
      descriptionRich: tt.descriptionRich,
      priority: tt.priority,
      subtasks: tt.subtasks,
      labels: tt.labels.map((n) => labelIdByName.get(n)).filter((id): id is string => Boolean(id)),
      recurrence: tt.recurrence,
      createdAt: now,
    }));
    await db.transaction("rw", db.projects, db.labels, db.taskTemplates, async () => {
      await db.projects.add(project);
      await db.labels.bulkAdd(labelRows);
      await db.taskTemplates.bulkAdd(tplRows);
    });
    return project;
  },

  async remove(id: string): Promise<void> {
    if (id.startsWith("tpl-")) throw new Error("内置模板不可删除");
    await db.projectTemplates.delete(id);
  },
};
