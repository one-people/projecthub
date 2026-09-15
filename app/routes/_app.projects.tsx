import { useEffect, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { projectRepository } from "~/repositories/project.repository";
import { session } from "~/auth/session";
import { useI18n, t as translate } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";
import type { Project } from "~/models/project";
import type { User } from "~/models/user";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  projectAdmin: "项目管理员",
  member: "成员",
  guest: "只读访客",
};

export const handle = { crumb: () => ({ label: translate("projects"), to: "/" }) };

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void (async () => {
      setProjects(await projectRepository.list());
      setMe(await session.currentUser());
    })();
  }, []);

  async function createDemo() {
    const project = await projectRepository.createDemo();
    navigate(`/projects/${project.id}/board`);
  }

  return (
    <div>
      <div className="page-toolbar">
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("allProjects")}</h1>
        <span className="page-toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => void createDemo()}>
          <Icon name="plus" size={16} />
          {t("createDemo")}
        </button>
      </div>
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <div
              className="project-card"
              role="button"
              tabIndex={0}
              aria-label={`打开项目 ${p.name}`}
              onClick={() => navigate(`/projects/${p.id}/board`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/projects/${p.id}/board`);
              }}
            >
              <span className="project-card__name">{p.name}</span>
              <span className="project-card__meta">
                <span>{p.description}</span>
                <span className="badge badge--role">
                  {t("myRole")}：{ROLE_LABELS[p.memberRoles[me?.id ?? ""] ?? ""] ?? "非成员"}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {projects.length === 0 && (
        <div className="empty">
          <Icon name="kanban" size={32} />
          <p style={{ margin: 0 }}>{t("noProjects")}</p>
        </div>
      )}
    </div>
  );
}
