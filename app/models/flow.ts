import { z } from "zod";

/** 流程图节点形状：开始/结束（圆角胶囊）、处理（矩形）、判断（菱形）、输入输出（平行四边形） */
export const flowNodeKinds = ["start", "end", "process", "decision", "io"] as const;
export type FlowNodeKind = (typeof flowNodeKinds)[number];

export const flowNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(flowNodeKinds),
  x: z.number(), // 画布坐标（px，未缩放）
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().max(200),
});

export const flowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(), // 起点节点 id
  to: z.string(), // 终点节点 id
  label: z.string().max(40).default(""), // 分支条件（如 是/否）
});

/** 应用级流程图文档（独立菜单模块，不挂项目），节点/连线整存整取 */
export const flowSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  nodes: z.array(flowNodeSchema).default([]),
  edges: z.array(flowEdgeSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Flow = z.infer<typeof flowSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
