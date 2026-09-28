import { useI18n } from "~/lib/i18n";
import { PRIORITY_META, PRIORITY_LABEL_KEY } from "~/lib/priority";
import {
  computeBurndown,
  computePriorityDistribution,
  computeStatusDistribution,
  computeTrend,
  computeWorkload,
  type BurndownPoint,
} from "~/lib/stats";
import type { Task } from "~/models/task";
import type { StatusColumn } from "~/models/project";
import type { User } from "~/models/user";

interface StatsViewProps {
  tasks: Task[];
  columns: StatusColumn[];
  users: User[];
}

function fmtDay(day: string): string {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}

/** 燃尽图：剩余任务折线 + 理想线 */
function BurndownChart({ points }: { points: BurndownPoint[] }) {
  const { t } = useI18n();
  if (points.length < 2) return <p className="empty">{t("statsNoData")}</p>;
  const W = 560;
  const H = 180;
  const PAD = { l: 28, r: 8, t: 12, b: 22 };
  const max = Math.max(...points.map((p) => p.remaining), points[0]!.created, 1);
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.remaining).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ideal = `M${x(0).toFixed(1)},${y(points[0]!.created).toFixed(1)} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)}`;
  const gridY = [0, max / 2, max];
  const labelEvery = Math.ceil(points.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("statsBurndown")} className="stats-svg">
      {gridY.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stats-grid" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="stats-tick">{Math.round(v)}</text>
        </g>
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 || i === points.length - 1 ? (
          <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" className="stats-tick">{fmtDay(p.day)}</text>
        ) : null,
      )}
      <path d={area} className="stats-burn-area" />
      <path d={ideal} className="stats-ideal" strokeDasharray="4 4" />
      <path d={line} className="stats-burn-line" />
      {points.length > 0 && (
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]!.remaining)} r={3} className="stats-burn-dot" />
      )}
    </svg>
  );
}

/** 成员负载：横向堆叠条（未完成/已完成） */
function WorkloadChart({ rows }: { rows: ReturnType<typeof computeWorkload> }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="empty">{t("statsNoData")}</p>;
  const max = Math.max(...rows.map((r) => r.open + r.done), 1);
  return (
    <ul className="stats-workload">
      {rows.map((r) => (
        <li key={r.userId || "none"} className="stats-workload__row">
          <span className="stats-workload__name" title={r.name}>{r.name}</span>
          <span className="stats-workload__track" role="img" aria-label={t("statsWorkloadAria", { name: r.name, open: r.open, done: r.done })}>
            <span className="stats-workload__open" style={{ width: `${(r.open / max) * 100}%` }} />
            <span className="stats-workload__done" style={{ width: `${(r.done / max) * 100}%` }} />
          </span>
          <span className="stats-workload__num">{r.open}/{r.open + r.done}</span>
        </li>
      ))}
    </ul>
  );
}

/** 完成趋势：最近 8 周柱状 */
function TrendChart({ weeks }: { weeks: ReturnType<typeof computeTrend> }) {
  const { t } = useI18n();
  const W = 560;
  const H = 150;
  const PAD = { l: 24, r: 8, t: 10, b: 20 };
  const max = Math.max(...weeks.map((w) => w.completed), 1);
  const bw = (W - PAD.l - PAD.r) / weeks.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("statsTrend")} className="stats-svg">
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line
            x1={PAD.l} x2={W - PAD.r}
            y1={PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)}
            y2={PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)}
            className="stats-grid"
          />
          <text
            x={PAD.l - 5} y={PAD.t + (1 - v / max) * (H - PAD.t - PAD.b) + 4}
            textAnchor="end" className="stats-tick"
          >
            {Math.round(v)}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const h = (w.completed / max) * (H - PAD.t - PAD.b);
        return (
          <g key={w.weekStart}>
            <rect
              x={PAD.l + i * bw + bw * 0.2}
              y={PAD.t + (H - PAD.t - PAD.b) - h}
              width={bw * 0.6}
              height={Math.max(h, w.completed > 0 ? 2 : 0)}
              rx={2}
              className="stats-bar"
            />
            <text x={PAD.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="stats-tick">
              {fmtDay(w.weekStart)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function StatsView({ tasks, columns, users }: StatsViewProps) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const burn = computeBurndown(tasks, today);
  const workload = computeWorkload(tasks, users);
  const trend = computeTrend(tasks, today);
  const status = computeStatusDistribution(tasks, columns);
  const priority = computePriorityDistribution(tasks);
  const total = tasks.filter((x) => !x.deletedAt).length;
  const done = tasks.filter((x) => !x.deletedAt && x.completedAt).length;
  const overdue = tasks.filter((x) => !x.deletedAt && !x.completedAt && x.dueDate && x.dueDate.slice(0, 10) < today).length;
  const statusMax = Math.max(...status.map((s) => s.count), 1);
  const prjTotal = Math.max(total, 1);

  return (
    <div className="stats-page">
      <div className="stats-kpis">
        <div className="stats-kpi">
          <span className="stats-kpi__num">{total}</span>
          <span className="stats-kpi__label">{t("statsTotal")}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__num">{done}</span>
          <span className="stats-kpi__label">{t("statsDone")}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__num stats-kpi__num--danger">{overdue}</span>
          <span className="stats-kpi__label">{t("statsOverdue")}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__num">{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
          <span className="stats-kpi__label">{t("statsCompletion")}</span>
        </div>
      </div>

      <section className="card stats-card">
        <h3 className="section-title" style={{ fontSize: 13 }}>{t("statsBurndown")}</h3>
        <BurndownChart points={burn} />
      </section>

      <div className="stats-grid-2">
        <section className="card stats-card">
          <h3 className="section-title" style={{ fontSize: 13 }}>{t("statsWorkload")}</h3>
          <WorkloadChart rows={workload} />
        </section>
        <section className="card stats-card">
          <h3 className="section-title" style={{ fontSize: 13 }}>{t("statsTrend")}</h3>
          <TrendChart weeks={trend} />
        </section>
      </div>

      <div className="stats-grid-2">
        <section className="card stats-card">
          <h3 className="section-title" style={{ fontSize: 13 }}>{t("statsStatusDist")}</h3>
          <div className="stats-stack" role="img" aria-label={t("statsStatusDist")}>
            {status.map((s) => (
              <div key={s.columnId} className="stats-stack__row">
                <span className="stats-stack__name">{s.name}</span>
                <span className="stats-stack__track">
                  <span className="stats-stack__bar" style={{ width: `${(s.count / statusMax) * 100}%` }} />
                </span>
                <span className="stats-stack__num">{s.count}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card stats-card">
          <h3 className="section-title" style={{ fontSize: 13 }}>{t("statsPriorityDist")}</h3>
          <ul className="stats-prio">
            {priority.map((p) => (
              <li key={p.priority} className="stats-prio__row">
                <span className="prio__dot" style={{ background: PRIORITY_META[p.priority].color }} />
                <span className="stats-prio__name">{t(PRIORITY_LABEL_KEY[p.priority])}</span>
                <span className="stats-stack__track">
                  <span className="stats-stack__bar" style={{ width: `${(p.count / prjTotal) * 100}%` }} />
                </span>
                <span className="stats-stack__num">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
