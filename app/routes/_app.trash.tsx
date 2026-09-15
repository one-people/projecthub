import { useI18n } from "~/lib/i18n";
import { Icon } from "~/components/ui/Icon";

export default function TrashRoute() {
  const { t } = useI18n();
  return (
    <div className="empty">
      <Icon name="trash" size={32} />
      <p style={{ margin: 0 }}>{t("comingSoon")}</p>
    </div>
  );
}
