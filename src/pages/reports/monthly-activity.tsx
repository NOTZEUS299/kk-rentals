import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { CHALLAN_ACCENT, CHALLAN_BADGE } from "@/lib/challan-badge";
import { fmtDate, monthRangeISO } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { ChallanType } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import {
  Badge,
  Card,
  EmptyState,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";
import { Icon } from "@/components/icons";

const TYPES: ChallanType[] = ["issue", "return", "borrow", "giveback"];

interface Row {
  id: string;
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  parties: { name: string } | null;
  challan_lines: { qty: number; deleted_at: string | null }[];
}

async function loadMonth(firmId: string | null, from: string, to: string) {
  let query = supabase
    .from("rental_challans")
    .select(
      "id, type, challan_no, challan_date, parties:rental_parties(name), challan_lines:rental_challan_lines(qty, deleted_at)",
    )
    .is("deleted_at", null)
    .gte("challan_date", from)
    .lte("challan_date", to)
    .order("challan_date", { ascending: false });
  if (firmId) query = query.eq("firm_id", firmId);
  const { data } = await query;
  return (data as unknown as Row[]) ?? [];
}

const rowQty = (r: Row) =>
  r.challan_lines
    .filter((l) => !l.deleted_at)
    .reduce((s, l) => s + Number(l.qty), 0);

export default function MonthlyActivityPage() {
  const locale = useLocale();
  const t = useTranslations("reports");
  const tch = useTranslations("challans");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const { from, to } = monthRangeISO(month);

  const { data, loading } = useQuery(
    () => loadMonth(firmId, from, to),
    [firmId, from, to],
  );

  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() &&
    month.getMonth() === now.getMonth();
  const shift = (dir: -1 | 1) => {
    setExpanded(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  };

  // month totals + per-day grouping
  const totals: Record<ChallanType, { count: number; qty: number }> = {
    issue: { count: 0, qty: 0 },
    return: { count: 0, qty: 0 },
    borrow: { count: 0, qty: 0 },
    giveback: { count: 0, qty: 0 },
  };
  const byDay = new Map<string, Row[]>();
  for (const r of data ?? []) {
    totals[r.type].count += 1;
    totals[r.type].qty += rowQty(r);
    const arr = byDay.get(r.challan_date) ?? [];
    arr.push(r);
    byDay.set(r.challan_date, arr);
  }
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      <PageHeader title={t("monthlyActivity")} />
      <p className="mb-3 text-xs text-muted">{t("monthlyActivityHint")}</p>

      {/* month navigation */}
      <div className="mb-4 flex items-center justify-between rounded-app border border-border bg-card px-2 py-1.5">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-app text-muted hover:text-foreground"
          aria-label={tc("back")}
        >
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">
          {month.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={isCurrentMonth}
          className="flex h-9 w-9 items-center justify-center rounded-app text-muted hover:text-foreground disabled:opacity-30"
          aria-label={tc("back")}
        >
          <Icon name="chevron-right" className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : (
        <>
          {/* month totals */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {TYPES.map((ty) => (
              <Card key={ty} className="text-center">
                <div className={`text-xl font-bold ${CHALLAN_ACCENT[ty].text}`}>
                  {totals[ty].qty}
                </div>
                <div className="text-xs text-muted">
                  {tch(ty)} · {totals[ty].count}
                </div>
              </Card>
            ))}
          </div>

          {days.length === 0 ? (
            <EmptyState message={t("noActivity")} />
          ) : (
            <div className="space-y-2">
              {days.map((day) => {
                const rows = byDay.get(day) ?? [];
                const open = expanded === day;
                return (
                  <Card key={day}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : day)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={open}
                    >
                      <span className="text-sm font-medium">
                        {fmtDate(day, locale)}
                      </span>
                      <span className="flex flex-wrap items-center justify-end gap-1">
                        {TYPES.filter((ty) =>
                          rows.some((r) => r.type === ty),
                        ).map((ty) => (
                          <Badge key={ty} className={CHALLAN_BADGE[ty]}>
                            {rows.filter((r) => r.type === ty).length} ·{" "}
                            {rows
                              .filter((r) => r.type === ty)
                              .reduce((s, r) => s + rowQty(r), 0)}
                          </Badge>
                        ))}
                        <Icon
                          name="chevron-down"
                          className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                    {open && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {rows.map((r) => (
                          <Link
                            key={r.id}
                            to={`/challans/${r.id}`}
                            className="flex items-center justify-between rounded-app px-2 py-1.5 hover:bg-background"
                          >
                            <span className="text-sm">
                              <span className="font-medium">{r.challan_no}</span>
                              <span className="text-muted">
                                {" "}
                                · {r.parties?.name}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-muted">
                                {tch("qty")}: {rowQty(r)}
                              </span>
                              <Badge className={CHALLAN_BADGE[r.type]}>
                                {tch(r.type)}
                              </Badge>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
