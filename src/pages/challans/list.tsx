import { Link, useSearchParams } from "react-router-dom";
import { useLocale, useTranslations } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { PAGE_SIZE, usePagedQuery } from "@/lib/use-paged-query";
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
import { CHALLAN_BADGE } from "@/lib/challan-badge";
import { FilterBar } from "@/components/filter-bar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";

const TYPES: ChallanType[] = ["issue", "return", "borrow", "giveback"];

type SortKey = "date-desc" | "date-asc" | "challanNo";

interface Filters {
  q: string;
  from: string;
  to: string;
  sort: SortKey;
}

interface Row {
  id: string;
  type: ChallanType;
  challan_no: string | null;
  challan_date: string;
  vehicle_no: string | null;
  custom_fields: Record<string, unknown> | null;
  parties: { name: string } | null;
  drivers: { name: string } | null;
  challan_lines: { qty: number; marko: string | null }[];
}

async function loadChallans(
  firmId: string | null,
  typeFilter: ChallanType | null,
  filters: Filters,
  page: number,
): Promise<Row[]> {
  let query = supabase
    .from("rental_challans")
    .select(
      "id, type, challan_no, challan_date, vehicle_no, custom_fields, parties:rental_parties(name), drivers:rental_drivers(name), challan_lines:rental_challan_lines(qty, marko)",
    )
    .is("deleted_at", null);
  if (firmId) query = query.eq("firm_id", firmId);
  if (typeFilter) query = query.eq("type", typeFilter);
  if (filters.from) query = query.gte("challan_date", filters.from);
  if (filters.to) query = query.lte("challan_date", filters.to);
  if (filters.q) query = query.ilike("challan_no", `%${filters.q}%`);
  if (filters.sort === "challanNo")
    query = query.order("challan_no", { ascending: true });
  else
    query = query.order("challan_date", {
      ascending: filters.sort === "date-asc",
    });
  query = query
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  const { data } = await query;
  return (data as unknown as Row[]) ?? [];
}

export default function ChallansPage() {
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get("type");
  const typeFilter = TYPES.includes(rawType as ChallanType)
    ? (rawType as ChallanType)
    : null;
  const locale = useLocale();
  const t = useTranslations("challans");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const rawSort = searchParams.get("sort");
  const filters: Filters = {
    q: searchParams.get("q") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    sort: (["date-desc", "date-asc", "challanNo"] as const).includes(
      rawSort as SortKey,
    )
      ? (rawSort as SortKey)
      : "date-desc",
  };

  const { rows: challans, loading, loadingMore, hasMore, loadMore } =
    usePagedQuery(
      (page) => loadChallans(firmId, typeFilter, filters, page),
      [firmId, typeFilter, filters.q, filters.from, filters.to, filters.sort],
    );

  const chipClass = (active: boolean) =>
    `flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-card text-muted"
    }`;

  return (
    <div>
      <PageHeader
        title={t("title")}
        action={
          <Link
            to="/challans/new"
            className="flex min-h-10 items-center gap-1 rounded-app bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Icon name="plus" className="h-4 w-4" />
            {tc("add")}
          </Link>
        }
      />

      {/* filter by challan type */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Link to="/challans" className={chipClass(!typeFilter)}>
          {t("all")}
        </Link>
        {TYPES.map((ty) => (
          <Link
            key={ty}
            to={`/challans?type=${ty}`}
            className={chipClass(typeFilter === ty)}
          >
            {t(ty)}
          </Link>
        ))}
      </div>

      <FilterBar
        placeholder={t("searchPlaceholder")}
        sortOptions={[
          { value: "date-desc", label: tc("newestFirst") },
          { value: "date-asc", label: tc("oldestFirst") },
          { value: "challanNo", label: t("sortChallanNo") },
        ]}
      />

      {loading ? (
        <ListSkeleton />
      ) : challans.length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {challans.map((ch) => {
            const qty = ch.challan_lines.reduce(
              (sum, l) => sum + Number(l.qty),
              0,
            );
            const markos = [
              ...new Set(ch.challan_lines.map((l) => l.marko).filter(Boolean)),
            ];
            // admin-defined extra values captured on this challan
            const customEntries = Object.entries(ch.custom_fields ?? {}).filter(
              ([, v]) => v !== null && v !== "" && v !== false,
            );
            return (
              <Link key={ch.id} to={`/challans/${ch.id}`} className="block">
                <Card interactive className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {ch.parties?.name}
                    </div>
                    <div className="text-xs text-muted">
                      {ch.challan_no} · {fmtDate(ch.challan_date, locale)} ·{" "}
                      {t("qty")}: {qty}
                      {ch.drivers?.name && <> · {ch.drivers.name}</>}
                      {markos.length > 0 && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="font-medium text-foreground">
                            {markos.join(", ")}
                          </span>
                        </>
                      )}
                    </div>
                    {customEntries.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted">
                        {customEntries
                          .map(
                            ([k, v]) => `${k}: ${v === true ? "✓" : String(v)}`,
                          )
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <Badge className={CHALLAN_BADGE[ch.type] ?? CHALLAN_BADGE.issue}>
                    {t(ch.type)}
                  </Badge>
                </Card>
              </Link>
            );
          })}
          <InfiniteSentinel
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </div>
      )}
    </div>
  );
}
