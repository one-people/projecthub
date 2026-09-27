import { Link, useMatches } from "@remix-run/react";
import { Icon } from "~/components/ui/Icon";
import { t } from "~/lib/i18n";

interface Crumb {
  label: string;
  to?: string;
}

type CrumbHandle = { crumb?: () => Crumb };

export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .map((m) => (m.handle as CrumbHandle | undefined)?.crumb?.())
    .filter((c): c is Crumb => Boolean(c));
  if (crumbs.length === 0) return null;
  return (
    <nav className="breadcrumbs" aria-label={t("breadcrumbs")}>
      {crumbs.map((c, i) => (
        <span key={i} className="breadcrumbs__item">
          {i > 0 && <Icon name="chevronRight" size={13} />}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
