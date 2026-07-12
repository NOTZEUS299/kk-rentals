import { Link } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { useTenantSession } from "@/session";
import { moduleEnabled, subEnabled, type AppAccess } from "@/lib/app-access";
import type { LedgerKey } from "@/lib/features";
import { Card, PageHeader } from "@/components/ui";
import { Icon, type IconProp } from "@/components/icons";

const REPORTS: {
  href: string;
  key: string;
  icon: IconProp;
  /** feature-flag gate; undefined = not ledger-gated */
  gate?: LedgerKey;
  accessGate: (a: AppAccess) => boolean;
}[] = [
  {
    href: "/billing",
    key: "partyLedger",
    icon: "wallet",
    gate: "party",
    accessGate: (a) => moduleEnabled(a, "rental", "billing"),
  },
  {
    href: "/reports/outstanding",
    key: "outstanding",
    icon: "chart",
    gate: "party",
    accessGate: (a) => subEnabled(a, "rental", "reports", "outstanding"),
  },
  {
    href: "/reports/item-ledger",
    key: "itemLedger",
    icon: "package",
    gate: "item",
    accessGate: (a) => subEnabled(a, "rental", "reports", "itemLedger"),
  },
  {
    href: "/reports/day-book",
    key: "dayBook",
    icon: "receipt",
    gate: "dayBook",
    accessGate: (a) => subEnabled(a, "rental", "reports", "dayBook"),
  },
  {
    href: "/reports/due-on-rent",
    key: "dueOnRent",
    icon: "alert",
    gate: "party",
    accessGate: (a) => subEnabled(a, "rental", "reports", "dueOnRent"),
  },
  {
    href: "/reports/monthly-activity",
    key: "monthlyActivity",
    icon: "calendar",
    accessGate: (a) => subEnabled(a, "rental", "reports", "monthlyActivity"),
  },
];

export default function ReportsPage() {
  const t = useTranslations("reports");
  const { features, access } = useTenantSession();

  return (
    <div>
      <PageHeader title={t("title")} />
      <div className="space-y-2">
        {REPORTS.filter(
          (r) => (!r.gate || features.ledgers[r.gate]) && r.accessGate(access),
        ).map((r) => (
          <Link key={r.href} to={r.href} className="block">
            <Card interactive className="flex items-center gap-3">
              <Icon name={r.icon} className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">{t(r.key)}</div>
                <div className="text-xs text-muted">{t(`${r.key}Hint`)}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
