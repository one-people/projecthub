import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@remix-run/react";
import { liveQuery } from "dexie";
import { db } from "~/repositories/db";
import { FlowView } from "~/components/flow/FlowView";
import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import { flowSchema, type Flow } from "~/models/flow";
import { t as translate } from "~/lib/i18n";

export const handle = { crumb: () => ({ label: translate("flowsMenu"), to: "/flows" }) };

/** 流程图编辑页：面包屑回到「流程图」，画布铺满余下空间；文档被删时回列表 */
export default function FlowEditorRoute() {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [flow, setFlow] = useState<Flow | null | undefined>(undefined); // undefined = 加载中；null = 不存在

  useEffect(() => {
    if (!flowId) return;
    // liveQuery 原始行不经 Zod 默认值，展示前归一化
    const sub = liveQuery(async () => {
      const row = await db.flows.get(flowId);
      return row ? flowSchema.parse(row) : null;
    }).subscribe((row) => {
      setFlow((prev) => {
        // 从有到无 = 文档被删除（列表页删除后回到列表，而不是留在空白编辑页）
        if (row === null && prev) navigate("/flows", { replace: true });
        return row;
      });
    });
    return () => sub.unsubscribe();
  }, [flowId, navigate]);

  if (!flowId || flow === null) {
    return (
      <div className="flow-page">
        <p className="empty">{t("flowNotFound")}</p>
      </div>
    );
  }
  if (flow === undefined) {
    return (
      <div className="flow-page">
        <p className="empty">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flow-page">
      <div className="flow-page__head">
        <button
          type="button"
          className="flow-page__back"
          onClick={() => navigate("/flows")}
          aria-label={t("backToFlows")}
        >
          <Icon name="back" size={15} />
          {t("flowsMenu")}
        </button>
        <span className="flow-page__name" title={flow.name}>{flow.name}</span>
      </div>
      <FlowView flow={flow} flowId={flowId} />
    </div>
  );
}
