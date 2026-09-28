import { useEffect, useState } from "react";
import { useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { StatsView } from "~/components/stats/StatsView";
import { db } from "~/repositories/db";
import { t as translate } from "~/lib/i18n";
import type { Task } from "~/models/task";
import type { User } from "~/models/user";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("statsView") }) };

export default function StatsRoute() {
  const { project, users } = useOutletContext<ProjectOutletContext>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>(users);

  useEffect(() => {
    const sub = liveQuery(() =>
      db.tasks.where("projectId").equals(project.id).toArray(),
    ).subscribe((rows) => setTasks(rows.filter((r) => r.deletedAt === null)));
    return () => sub.unsubscribe();
  }, [project.id]);

  // 成员可能在项目加载后才齐全，跟随 users 出口上下文
  useEffect(() => setAllUsers(users), [users]);

  return (
    <StatsView tasks={tasks} columns={project.statusColumns} users={allUsers} />
  );
}
