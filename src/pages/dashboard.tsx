import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { AGING_BADGE, agingSeverity, daysOnRent, loadAging } from "@/lib/aging";
import { subEnabled } from "@/lib/app-access";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { ChallanType } from "@/lib/types";
import type { QuickAction } from "@/lib/ui-settings";
import { firmsActive, useTenantSession } from "@/session";
import {
  Badge,
  Card,
  EmptyState,
  ListSkeleton,
  SectionHeading,
  StatCard,
} from "@/components/ui";
import { Icon, type IconProp } from "@/components/icons";
import { CHALLAN_ACCENT, CHALLAN_BADGE } from "@/lib/challan-badge";
import { ResetDataButton } from "@/components/reset-data-button";

/** icon per challan-type shortcut in the quick-actions widget */
const ACTION_ICON: Record<QuickAction, IconProp> = {
  issue: "plus",
  return: "receipt",
  borrow: "package",
  giveback: "truck",
};

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning";
  if (h < 17) return "greetingAfternoon";
  return "greetingEvening";
}

interface RecentChallan {
  id: string;
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  parties: { name: string } | null;
}

interface DashboardData {
  partiesCount: number;
  itemsCount: number;
  qtyOut: number;
  recent: RecentChallan[];
}

async function loadDashboard(
  firmId: string | null,
  recentCount: number,
): Promise<DashboardData> {
  let itemsCount = supabase
    .from("rental_items")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (firmId) itemsCount = itemsCount.eq("firm_id", firmId);

  let recentQuery = supabase
    .from("rental_challans")
    .select("id, type, challan_no, challan_date, parties:rental_parties(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(recentCount);
  if (firmId) recentQuery = recentQuery.eq("firm_id", firmId);

  // outstanding_lines has no firm_id; scope it by the firm's item ids
  let firmItemIds: Set<string> | null = null;
  if (firmId) {
    const { data: idRows } = await supabase
      .from("rental_items")
      .select("id")
      .is("deleted_at", null)
      .eq("firm_id", firmId);
    firmItemIds = new Set((idRows ?? []).map((r) => r.id as string));
  }

  const [parties, items, outstanding, recent] = await Promise.all([
    supabase
      .from("rental_parties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    itemsCount,
    supabase.from("rental_outstanding_lines").select("item_id, qty_out"),
    recentQuery,
  ]);

  const qtyOut = (outstanding.data ?? [])
    .filter((row) => !firmItemIds || firmItemIds.has(row.item_id as string))
    .reduce((sum, row) => sum + Number(row.qty_out ?? 0), 0);

  return {
    partiesCount: parties.count ?? 0,
    itemsCount: items.count ?? 0,
    qtyOut,
    recent: (recent.data as unknown as RecentChallan[]) ?? [],
  };
}

const OVERDUE_DAYS = 30;

function OverdueAlerts() {
  const { tenant, firm } = useTenantSession();
  const t = useTranslations("dashboard");
  const tr = useTranslations("reports");
  const [open, setOpen] = useState(true);
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data } = useQuery(
    () => loadAging(tenant.settings?.billing ?? {}, firmId),
    [tenant.id, firmId],
  );

  const rows = (data ?? [])
    .map((row) => ({ ...row, days: daysOnRent(row.oldestFrom) }))
    .filter((row) => row.days > OVERDUE_DAYS)
    .sort((a, b) => b.days - a.days);
  if (rows.length === 0) return null;

  return (
    <Card className="border-red-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          <Icon name="alert" className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-semibold">
          {t("overdueAlerts")}
        </span>
        <Badge className="bg-red-100 text-red-800">{rows.length}</Badge>
        <Icon
          name="chevron-down"
          className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {rows.slice(0, 5).map((row) => (
            <Link
              key={row.party.id}
              to={`/billing/${row.party.id}`}
              className="flex items-center justify-between gap-2 rounded-app border border-border px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {row.party.name}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge className={AGING_BADGE[agingSeverity(row.days)]}>
                  {row.days} {tr("daysShort")}
                </Badge>
                {row.party.phone && (
                  <a
                    href={`tel:${row.party.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary"
                  >
                    <Icon name="phone" className="h-3.5 w-3.5" />
                  </a>
                )}
              </span>
            </Link>
          ))}
          <Link
            to="/reports/due-on-rent"
            className="block pt-1 text-center text-sm font-medium text-primary"
          >
            {t("viewAll")} →
          </Link>
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { tenant, firm, uiSettings: ui, access, features } = useTenantSession();
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const tch = useTranslations("challans");
  const tc = useTranslations("common");

  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;
  const { data, loading } = useQuery(
    () => loadDashboard(firmId, ui.dashboard.recentCount),
    [firmId, ui.dashboard.recentCount],
  );

  if (loading || !data) return <ListSkeleton />;

  // heaviest dashboard query — only when the widget is configured in
  // and the tenant can actually reach the due-on-rent report
  const showOverdue =
    ui.dashboard.widgets.includes("overdueAlerts") &&
    subEnabled(access, "rental", "reports", "dueOnRent") &&
    features.ledgers.party;

  const widgets: Record<string, React.ReactNode> = {
    hero: (
      <section
        key="hero"
        className="relative overflow-hidden rounded-app bg-linear-to-br from-primary to-primary-strong p-5 text-primary-foreground shadow-md"
      >
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-primary-foreground/10" />
        <div className="pointer-events-none absolute -bottom-14 right-16 h-28 w-28 rounded-full bg-primary-foreground/5" />
        <div className="relative">
          <p className="text-sm opacity-90">{t(greetingKey())}</p>
          <h1 className="mt-0.5 text-xl font-bold">
            {firm?.name ?? tenant.name}
          </h1>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
            <Icon name="calendar" className="h-3.5 w-3.5" />
            {fmtDate(new Date().toISOString(), locale)}
          </span>
        </div>
      </section>
    ),
    stats: (
      <div key="stats" className="grid grid-cols-3 gap-3">
        <Link to="/parties" className="block">
          <StatCard
            value={data.partiesCount}
            label={t("parties")}
            icon={<Icon name="users" className="h-4 w-4" />}
          />
        </Link>
        <Link to="/items" className="block">
          <StatCard
            value={data.itemsCount}
            label={t("items")}
            icon={<Icon name="package" className="h-4 w-4" />}
          />
        </Link>
        <Link to="/billing" className="block">
          <StatCard
            value={data.qtyOut}
            label={t("qtyOut")}
            icon={<Icon name="truck" className="h-4 w-4" />}
          />
        </Link>
      </div>
    ),
    quickActions: ui.dashboard.quickActions.length > 0 && (
      <div key="quickActions" className="grid grid-cols-2 gap-3">
        {ui.dashboard.quickActions
          .filter((action) => subEnabled(access, "rental", "challans", action))
          .map((action) => (
            <Link
              key={action}
              to={`/challans/new?type=${action}`}
              className={`group flex min-h-20 flex-col justify-center gap-1.5 rounded-app p-4 text-white shadow-sm transition-transform hover:scale-[1.03] hover:shadow-md active:scale-[0.97] ${CHALLAN_ACCENT[action].grad}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-app bg-white/20">
                <Icon name={ACTION_ICON[action]} className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-semibold">
                {t(`action_${action}`)}
              </span>
            </Link>
          ))}
      </div>
    ),
    overdueAlerts: showOverdue ? <OverdueAlerts key="overdueAlerts" /> : null,
    recentChallans: (
      <section key="recentChallans">
        <SectionHeading>{t("recentChallans")}</SectionHeading>
        {data.recent.length === 0 ? (
          <EmptyState message={tc("noData")} />
        ) : (
          <div className="space-y-2">
            {data.recent.map((ch) => (
              <Link key={ch.id} to={`/challans/${ch.id}`} className="block">
                <Card interactive className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {ch.parties?.name}
                    </div>
                    <div className="text-xs text-muted">
                      {ch.challan_no} · {fmtDate(ch.challan_date, locale)}
                    </div>
                  </div>
                  <Badge className={CHALLAN_BADGE[ch.type] ?? CHALLAN_BADGE.issue}>
                    {tch(ch.type)}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    ),
  };

  return (
    <div className="space-y-4">
      {ui.dashboard.widgets.map((w) => widgets[w])}
      {import.meta.env.DEV && <ResetDataButton />}
    </div>
  );
}
