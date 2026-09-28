// app/index.ts —— 项目统一出口
// 领域模型与 Schema
export * from "./models/task";
export * from "./models/project";
export * from "./models/comment";
export * from "./models/user";

// 领域服务
export { taskService } from "./services/task.service";
export { commentService } from "./services/comment.service";

// 权限
export { can } from "./auth/rbac";
export { ROLES } from "./auth/rbac";
export type { Permission, RoleId, Role } from "./auth/rbac";

// 数据仓库
export { db } from "./repositories/db";
export { taskRepository } from "./repositories/task.repository";
export { projectRepository, DEFAULT_COLUMNS } from "./repositories/project.repository";

// 核心组件
export { Board } from "./components/board/Board";
export type { MoveIntent } from "./components/board/Board";
export { Column } from "./components/board/Column";
export { TaskCard } from "./components/board/TaskCard";
export { TaskDrawer } from "./components/task/TaskDrawer";
export { CommentList } from "./components/comments/CommentList";
export { RichTextEditor, renderRichText } from "./components/editor/RichTextEditor";
export { broadcastChange, subscribeChanges } from "./repositories/broadcast";
export { session } from "./auth/session";

// 工具函数
export { formatDate, isOverdue, formatRelative } from "./lib/date";
export { uuid } from "./lib/id";
export { generateKeyBetween } from "./lib/fractional-index";
