import { useEffect, useState } from "react";
import { useOutletContext } from "@remix-run/react";
import { liveQuery } from "dexie";
import { FlowView } from "~/components/flow/FlowView";
import { flowService } from "~/services/flow.service";
import { db } from "~/repositories/db";
import { can } from "~/auth/rbac";
import { t as translate, useI18n } from "~/lib/i18n";
import type { Flow } from "~/models/flow";
import type { ProjectOutletContext } from "~/routes/_app.projects_.$projectId";

export const handle = { crumb: () => ({ label: translate("flowView") }) };

export default function FlowRoute() {
  const { project, role, actorId } = useOutletContext<ProjectOutletContext>();
  const { t } = useI18n();
  const canEdit = can(role, "task:update");
  // undefined = 加载中；null = 尚无图（可编辑身份会立即自动建图）
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined);

  useEffect(() => {
    const sub = liveQuery(() => db.flows.where("projectId").equals(project.id).first())
      .subscribe((row) => setFlow(row ?? null));
    return () => sub.unsubscribe();
  }, [project.id]);

  // 成员首次进入自动建图；访客保持只读空态，不代建
  useEffect(() => {
    if (flow !== null || !canEdit) return;
    void flowService.ensure(actorId, project.id, t("flowView")).catch(() => setFlow(null));
  }, [flow, canEdit, actorId, project.id, t]);

  if (flow === undefined) {
    return (
      <div className="flow-page">
        <p className="empty">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flow-page">
      <FlowView flow={flow} projectId={project.id} actorId={actorId} canEdit={canEdit} />
    </div>
  );
}
