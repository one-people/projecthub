import { db } from "~/repositories/db";
import { taskRepository } from "~/repositories/task.repository";
import { uuid } from "~/lib/id";
import { automationSchema, type Automation } from "~/models/automation";
import type { Task } from "~/models/task";

export interface AutomationInput {
  name: string;
  trigger: Automation["trigger"];
  action: Automation["action"];
}

/** 引擎事件：task_created / status_entered（进入某列）/ task_completed */
export interface AutomationEvent {
  projectId: string;
  type: Automation["trigger"]["type"];
  /** status_entered 时的目标列 */
  columnId?: string | null;
  taskId: string;
}

const TRIGGERS: Automation["trigger"]["type"][] = ["task_created", "status_entered", "task_completed"];
const ACTIONS: Automation["action"]["type"][] = ["assign", "set_priority", "move_to", "add_label"];

function validate(input: AutomationInput): AutomationInput {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error("规则名称不能为空");
  if (!TRIGGERS.includes(input.trigger.type)) throw new Error("未知触发器");
  if (input.trigger.type === "status_entered" && !input.trigger.columnId) {
    throw new Error("进入某列触发器需要选择列");
  }
  if (!ACTIONS.includes(input.action.type)) throw new Error("未知动作");
  if (input.action.type !== "set_priority" && !input.action.value) {
    throw new Error("该动作需要选择目标值");
  }
  return { name, trigger: input.trigger, action: input.action };
}

export const automationService = {
  async list(projectId: string): Promise<Automation[]> {
    const rows = await db.automations.where("projectId").equals(projectId).toArray();
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async create(projectId: string, input: AutomationInput): Promise<Automation> {
    const clean = validate(input);
    const row = automationSchema.parse({
      id: uuid(),
      projectId,
      name: clean.name,
      enabled: true,
      trigger: clean.trigger,
      action: clean.action,
      createdAt: new Date().toISOString(),
    });
    await db.automations.add(row);
    return row;
  },

  async update(id: string, patch: Partial<Pick<Automation, "name" | "enabled">>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, 100);
      if (!name) throw new Error("规则名称不能为空");
      body.name = name;
    }
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    await db.automations.update(id, body);
  },

  async remove(id: string): Promise<void> {
    await db.automations.delete(id);
  },

  /** 项目被彻底删除时清理其规则 */
  async stripProject(projectId: string): Promise<void> {
    await db.automations.where("projectId").equals(projectId).delete();
  },

  /**
   * 规则引擎：任务创建 / 进入某列 / 完成时套用 when-then 规则。
   * 直接写仓储而不回注引擎，避免 move_to 动作递归触发 status_entered。
   */
  async apply(event: AutomationEvent): Promise<Task | null> {
    const rules = (await db.automations.where("projectId").equals(event.projectId).toArray())
      .filter((r) => r.enabled)
      .filter((r) => r.trigger.type === event.type)
      .filter((r) => r.trigger.type !== "status_entered" || r.trigger.columnId === event.columnId);
    if (rules.length === 0) return null;

    let task: Task | undefined = await taskRepository.get(event.taskId);
    if (!task) return null;
    for (const rule of rules) {
      let latest: Task = (await taskRepository.get(event.taskId)) ?? task;
      const { type, value } = rule.action;
      if (type === "assign") {
        latest = await taskRepository.update(latest.id, { assigneeId: value });
      } else if (type === "set_priority") {
        latest = await taskRepository.update(latest.id, {
          priority: (value ?? "none") as Task["priority"],
        });
      } else if (type === "move_to") {
        if (value && value !== latest.status) {
          latest = await taskRepository.update(latest.id, { status: value });
        }
      } else if (type === "add_label") {
        if (value && !latest.labels.includes(value)) {
          latest = await taskRepository.update(latest.id, { labels: [...latest.labels, value] });
        }
      }
      task = latest;
    }
    return task;
  },
};
