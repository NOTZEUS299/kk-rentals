import { Link } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { AGING_BADGE, agingSeverity, daysOnRent, loadAging } from "@/lib/aging";
import { fmtMoney } from "@/lib/format";
import { useQuery } from "@/lib/use-query";
import { firmsActive, useTenantSession } from "@/session";
import {
  Badge,
  Card,
  EmptyState,
  ListSkeleton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { Icon } from "@/components/icons";

/** Material out longer than this many days counts as overdue. */
const OVERDUE_DAYS = 30;

export default function DueOnRentPage() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data, loading } = useQuery(
    () => loadAging(tenant.settings?.billing ?? {}, firmId),
    [tenant.id, firmId],
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t("dueOnRent")} />
        <ListSkeleton />
      </div>
    );
  }

  const rows = (data ?? [])
    .map((row) => ({ ...row, days: daysOnRent(row.oldestFrom) }))
    .filter((row) => row.days > OVERDUE_DAYS)
    .sort((a, b) => b.days - a.days);
  const exposure = rows.reduce(
    (s, r) => s + Math.max(0, r.rentAccrued - r.received),
    0,
  );

  return (
    <div>
      <PageHeader title={t("dueOnRent")} />
      <p className="mb-3 text-xs text-muted">{t("dueOnRentHint")}</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard value={rows.length} label={t("overdueParties")} />
        <StatCard value={fmtMoney(exposure)} label={t("totalExposure")} />
      </div>

      {rows.length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const balance = row.rentAccrued - row.received;
            return (
              <Link
                key={row.party.id}
                to={`/billing/${row.party.id}`}
                className="block"
              >
                <Card interactive>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {row.party.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {t("qtyOut")}:{" "}
                        <span className="font-medium text-foreground">
                          {row.qtyOut}
                        </span>{" "}
                        ·{" "}
                        <span
                          className={
                            balance > 0
                              ? "font-medium text-red-600"
                              : "font-medium text-emerald-700"
                          }
                        >
                          {fmtMoney(balance)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={AGING_BADGE[agingSeverity(row.days)]}>
                        {row.days} {t("daysShort")}
                      </Badge>
                      {row.party.phone && (
                        <a
                          href={`tel:${row.party.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary"
                          title={tc("call")}
                        >
                          <Icon name="phone" className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
