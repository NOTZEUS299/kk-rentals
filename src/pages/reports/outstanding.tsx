import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { loadAging } from "@/lib/aging";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useQuery } from "@/lib/use-query";
import { firmsActive, useTenantSession } from "@/session";
import { Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";

export default function OutstandingPage() {
  const t = useTranslations("reports");
  const tb = useTranslations("billing");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data: rows, loading } = useQuery(
    () => loadAging(tenant.settings?.billing ?? {}, firmId),
    [tenant.id, firmId],
  );

  return (
    <div>
      <PageHeader title={t("outstanding")} />
      <p className="mb-3 text-xs text-muted">{t("outstandingHint")}</p>
      {loading ? (
        <ListSkeleton />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {(rows ?? []).map((row) => {
            const balance = row.rentAccrued - row.received;
            return (
              <Link
                key={row.party.id}
                to={`/billing/${row.party.id}`}
                className="block"
              >
                <Card interactive>
                  <div className="flex items-start justify-between">
                    <div className="text-sm font-medium">{row.party.name}</div>
                    <div
                      className={`text-sm font-bold ${balance > 0 ? "text-red-600" : "text-emerald-700"}`}
                    >
                      {fmtMoney(balance)}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                    <span>
                      {t("qtyOut")}:{" "}
                      <span className="font-medium text-foreground">
                        {row.qtyOut}
                      </span>
                    </span>
                    <span>
                      {tb("rent")}:{" "}
                      <span className="font-medium text-foreground">
                        {fmtMoney(row.rentAccrued)}
                      </span>
                    </span>
                    {row.oldestFrom && (
                      <span>
                        {t("since")}:{" "}
                        <span className="font-medium text-foreground">
                          {fmtDate(row.oldestFrom, locale)}
                        </span>
                      </span>
                    )}
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
