import { Link, useSearchParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { Party } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { Card, EmptyState, ListSkeleton, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { Icon } from "@/components/icons";

interface BillingData {
  parties: Party[];
  qtyByParty: Map<string, number>;
  borrowedByParty: Map<string, number>;
}

async function loadBilling(firmId: string | null): Promise<BillingData> {
  // stock views have no firm_id; scope them by the firm's item ids
  let firmItemIds: Set<string> | null = null;
  if (firmId) {
    const { data: idRows } = await supabase
      .from("rental_items")
      .select("id")
      .is("deleted_at", null)
      .eq("firm_id", firmId);
    firmItemIds = new Set((idRows ?? []).map((r) => r.id as string));
  }

  const [{ data: parties }, { data: outstanding }, { data: borrowed }] =
    await Promise.all([
      supabase.from("rental_parties").select("*").is("deleted_at", null).order("name"),
      supabase.from("rental_outstanding_lines").select("party_id, item_id, qty_out"),
      supabase.from("rental_borrowed_lines").select("party_id, item_id, qty_borrowed"),
    ]);

  const inFirm = (itemId: string) => !firmItemIds || firmItemIds.has(itemId);

  const qtyByParty = new Map<string, number>();
  for (const row of outstanding ?? []) {
    if (!inFirm(row.item_id)) continue;
    qtyByParty.set(
      row.party_id,
      (qtyByParty.get(row.party_id) ?? 0) + Number(row.qty_out),
    );
  }
  const borrowedByParty = new Map<string, number>();
  for (const row of borrowed ?? []) {
    if (!inFirm(row.item_id)) continue;
    borrowedByParty.set(
      row.party_id,
      (borrowedByParty.get(row.party_id) ?? 0) + Number(row.qty_borrowed),
    );
  }

  return { parties: (parties as Party[]) ?? [], qtyByParty, borrowedByParty };
}

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = searchParams.get("sort") ?? "name";
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;

  const { data, loading } = useQuery(() => loadBilling(firmId), [firmId]);

  // page already loads all parties for aggregates — filter/sort locally
  const parties = (data?.parties ?? [])
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "outstanding"
        ? (data?.qtyByParty.get(b.id) ?? 0) - (data?.qtyByParty.get(a.id) ?? 0)
        : a.name.localeCompare(b.name),
    );

  return (
    <div>
      <PageHeader title={t("title")} />
      <FilterBar
        placeholder={tc("search")}
        showDates={false}
        sortOptions={[
          { value: "name", label: tc("byName") },
          { value: "outstanding", label: t("outstanding") },
        ]}
      />
      {loading || !data ? (
        <ListSkeleton />
      ) : parties.length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {parties.map((party) => (
            <Link key={party.id} to={`/billing/${party.id}`} className="block">
              <Card interactive className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{party.name}</div>
                  <div className="text-xs text-muted">
                    {t("outstanding")}: {data.qtyByParty.get(party.id) ?? 0}
                    {(data.borrowedByParty.get(party.id) ?? 0) !== 0 && (
                      <>
                        {" "}
                        · {t("borrowed")}: {data.borrowedByParty.get(party.id)}
                      </>
                    )}
                  </div>
                </div>
                <Icon name="wallet" className="h-5 w-5 text-muted" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
