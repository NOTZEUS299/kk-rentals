import { Link, useSearchParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { fmtMoney } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { Item } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { Icon } from "@/components/icons";

interface ItemsData {
  items: Item[];
  totalOutByItem: Map<string, number>;
  totalBorrowedByItem: Map<string, number>;
  variantQtyByItem: Map<string, number>;
  borrowedList: {
    item: Item;
    total: number;
    sources: { name: string; marko: string; qty: number }[];
  }[];
  outMarkoByItem: Map<string, { marko: string; qty: number }[]>;
}

async function loadItems(firmId: string | null, q: string): Promise<ItemsData> {
  let itemsQuery = supabase
    .from("rental_items")
    .select("*")
    .is("deleted_at", null)
    .order("name");
  if (firmId) itemsQuery = itemsQuery.eq("firm_id", firmId);
  if (q) itemsQuery = itemsQuery.ilike("name", `%${q}%`);

  const [
    { data: items },
    { data: parties },
    { data: outstandingRows },
    { data: borrowedRows },
    { data: borrowedMarkoRows },
    { data: outstandingMarkoRows },
    { data: variantRows },
  ] = await Promise.all([
    itemsQuery,
    supabase.from("rental_parties").select("id, name").is("deleted_at", null),
    supabase.from("rental_outstanding_lines").select("item_id, qty_out"),
    supabase.from("rental_borrowed_lines").select("item_id, qty_borrowed"),
    supabase.from("rental_borrowed_marko").select("party_id, item_id, marko, qty"),
    supabase.from("rental_outstanding_marko").select("item_id, marko, qty_out"),
    supabase
      .from("rental_item_variants")
      .select("item_id, total_qty")
      .is("deleted_at", null),
  ]);

  const totalOutByItem = new Map<string, number>();
  for (const row of outstandingRows ?? []) {
    totalOutByItem.set(
      row.item_id,
      (totalOutByItem.get(row.item_id) ?? 0) + Number(row.qty_out ?? 0),
    );
  }
  const totalBorrowedByItem = new Map<string, number>();
  for (const row of borrowedRows ?? []) {
    totalBorrowedByItem.set(
      row.item_id,
      (totalBorrowedByItem.get(row.item_id) ?? 0) +
        Number(row.qty_borrowed ?? 0),
    );
  }
  const variantQtyByItem = new Map<string, number>();
  for (const row of variantRows ?? []) {
    variantQtyByItem.set(
      row.item_id,
      (variantQtyByItem.get(row.item_id) ?? 0) + Number(row.total_qty ?? 0),
    );
  }

  const itemById = new Map(((items as Item[]) ?? []).map((i) => [i.id, i]));
  const partyNameById = new Map(
    (parties ?? []).map((p) => [p.id, (p as { id: string; name: string }).name]),
  );
  const borrowedByItem = new Map<
    string,
    {
      item: Item;
      total: number;
      sources: { name: string; marko: string; qty: number }[];
    }
  >();
  for (const row of borrowedMarkoRows ?? []) {
    const qty = Number(row.qty ?? 0);
    const item = itemById.get(row.item_id);
    if (qty <= 0 || !item) continue;
    const entry =
      borrowedByItem.get(row.item_id) ?? { item, total: 0, sources: [] };
    entry.total += qty;
    entry.sources.push({
      name: partyNameById.get(row.party_id) ?? row.party_id,
      marko: row.marko ?? "",
      qty,
    });
    borrowedByItem.set(row.item_id, entry);
  }
  const borrowedList = [...borrowedByItem.values()].sort(
    (a, b) => b.total - a.total,
  );
  for (const entry of borrowedList) entry.sources.sort((a, b) => b.qty - a.qty);

  const outMarkoByItem = new Map<string, { marko: string; qty: number }[]>();
  for (const row of outstandingMarkoRows ?? []) {
    const qty = Number(row.qty_out ?? 0);
    if (qty <= 0 || !itemById.has(row.item_id)) continue;
    const arr = outMarkoByItem.get(row.item_id) ?? [];
    arr.push({ marko: row.marko ?? "", qty });
    outMarkoByItem.set(row.item_id, arr);
  }
  for (const arr of outMarkoByItem.values()) arr.sort((a, b) => b.qty - a.qty);

  return {
    items: (items as Item[]) ?? [],
    totalOutByItem,
    totalBorrowedByItem,
    variantQtyByItem,
    borrowedList,
    outMarkoByItem,
  };
}

export default function ItemsPage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") === "borrowed" ? "borrowed" : "items";
  const q = (searchParams.get("q") ?? "").trim();
  const t = useTranslations("items");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  // inventory is separated per firm when a firm mode is active
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data, loading } = useQuery(() => loadItems(firmId, q), [firmId, q]);

  const ruleLabel = (item: Item) =>
    ({
      per_day: t("perDay"),
      per_month: t("perMonth"),
      min_days: t("minDays"),
      custom: t("custom"),
    })[item.rate_rule?.type ?? "per_day"];

  const tabClass = (active: boolean) =>
    `min-h-10 px-3 text-sm font-medium border-b-2 ${
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted"
    }`;

  const stockFor = (item: Item) => {
    const out = data?.totalOutByItem.get(item.id) ?? 0;
    const borrowed = data?.totalBorrowedByItem.get(item.id) ?? 0;
    const owned = item.total_qty + (data?.variantQtyByItem.get(item.id) ?? 0);
    const available = owned + borrowed - out;
    return { out, borrowed, available, owned };
  };

  return (
    <div>
      <PageHeader
        title={t("title")}
        action={
          view === "items" ? (
            <Link
              to="/items/new"
              className="flex min-h-10 items-center gap-1 rounded-app bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <Icon name="plus" className="h-4 w-4" />
              {t("new")}
            </Link>
          ) : undefined
        }
      />

      {/* Tabs: all items vs borrowed-from-suppliers stats */}
      <div className="mb-3 flex gap-1 border-b border-border">
        <Link to="/items" className={tabClass(view === "items")}>
          {t("tabItems")}
        </Link>
        <Link to="/items?view=borrowed" className={tabClass(view === "borrowed")}>
          {t("tabBorrowed")}
        </Link>
      </div>

      {view === "items" && <SearchInput placeholder={tc("search")} />}

      {loading || !data ? (
        <ListSkeleton />
      ) : view === "borrowed" ? (
        data.borrowedList.length === 0 ? (
          <EmptyState message={t("noBorrowed")} />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">{t("borrowedHeading")}</p>
            {data.borrowedList.map(({ item, total, sources }) => {
              const out = data.totalOutByItem.get(item.id) ?? 0;
              const om = data.outMarkoByItem.get(item.id) ?? [];
              return (
                <Link key={item.id} to={`/items/${item.id}`} className="block">
                  <Card interactive>
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-sm font-bold text-blue-600">
                        +{total} {item.unit}
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted">
                      {sources.map((s) => (
                        <div key={`${s.name}-${s.marko}`}>
                          <span className="font-medium text-foreground">
                            {s.qty}
                          </span>{" "}
                          {t("held")} · {s.name}
                          {s.marko && (
                            <span className="text-blue-600"> [{s.marko}]</span>
                          )}
                        </div>
                      ))}
                      {out > 0 && (
                        <div className="text-orange-600">
                          {out} {t("outAtCustomers")}
                        </div>
                      )}
                      {om.length > 0 && (
                        <div className="text-orange-600/80">
                          {t("outBySource")}:{" "}
                          {om.map((o, i) => (
                            <span key={i}>
                              {i > 0 && " · "}
                              {o.marko || "—"} {o.qty}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )
      ) : data.items.length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => {
            const { out, borrowed, available, owned } = stockFor(item);
            const availColor =
              available <= 0
                ? "text-red-600"
                : available < owned * 0.2
                  ? "text-amber-600"
                  : "text-emerald-700";
            return (
              <Link key={item.id} to={`/items/${item.id}`} className="block">
                <Card interactive>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-muted">
                        {t("totalQty")}: {owned} {item.unit} ·{" "}
                        {fmtMoney(item.default_rate)} · {ruleLabel(item)}
                        {item.marko && (
                          <>
                            {" "}
                            ·{" "}
                            <span className="font-medium text-foreground">
                              {t("marko")}: {item.marko}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-bold ${availColor}`}>
                      {available} {t("available")}
                    </div>
                  </div>
                  {/* Stock detail pills */}
                  <div className="mt-2 flex gap-3 text-xs text-muted">
                    <span>
                      <span className="font-medium text-foreground">{out}</span>{" "}
                      {t("out")}
                    </span>
                    {borrowed > 0 && (
                      <span>
                        <span className="font-medium text-blue-600">
                          +{borrowed}
                        </span>{" "}
                        {t("borrowed")}
                      </span>
                    )}
                    <span>
                      <span className="font-medium text-foreground">
                        {owned}
                      </span>{" "}
                      {t("owned")}
                    </span>
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
