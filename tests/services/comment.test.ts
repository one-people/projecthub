import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { extractMentionIds } from "~/services/mention.service";
import { notificationService } from "~/services/notification.service";
import { db } from "~/repositories/db";

const mentionDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "你好 " }] },
    { type: "mention", attrs: { id: "u1", label: "张三" } },
    { type: "paragraph", content: [
      { type: "mention", attrs: { id: "u1", label: "张三" } },
      { type: "mention", attrs: { id: "u2", label: "李四" } },
    ] },
  ],
};

describe("extractMentionIds", () => {
  it("提取 mention 节点并去重", () => {
    expect(extractMentionIds(mentionDoc).sort()).toEqual(["u1", "u2"]);
  });

  it("空文档与非法输入返回空数组", () => {
    expect(extractMentionIds(null)).toEqual([]);
    expect(extractMentionIds({ type: "doc" })).toEqual([]);
    expect(extractMentionIds("字符串")).toEqual([]);
  });
});

describe("notificationService", () => {
  beforeEach(async () => {
    await db.notifications.clear();
  });

  it("不通知操作者本人", async () => {
    await notificationService.notify({
      userId: "u1",
      actorId: "u1",
      type: "mention",
      taskId: "t1",
      taskTitle: "任务",
    });
    expect(await db.notifications.count()).toBe(0);
  });

  it("同类型同任务的未读通知去重合并计数", async () => {
    const input = {
      userId: "u1",
      actorId: "u2",
      type: "mention" as const,
      taskId: "t1",
      taskTitle: "任务",
    };
    await notificationService.notify(input);
    await notificationService.notify(input);
    const all = await db.notifications.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.payload.count).toBe(2);
  });

  it("全部已读后 unreadCount 归零", async () => {
    await notificationService.notify({
      userId: "u1",
      actorId: "u2",
      type: "comment",
      taskId: "t1",
      taskTitle: "任务",
    });
    expect(await notificationService.unreadCount("u1")).toBe(1);
    await notificationService.markAllRead("u1");
    expect(await notificationService.unreadCount("u1")).toBe(0);
  });
});
