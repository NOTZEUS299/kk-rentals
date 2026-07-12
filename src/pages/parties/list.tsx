import { Link, useSearchParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { Party } from "@/lib/types";
import {
  Badge,
  Card,
  EmptyState,
  ListSkeleton,
  PageHeader,
} from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { Icon } from "@/components/icons";

async function loadParties(q: string, sort: string): Promise<Party[]> {
  let query = supabase
    .from("rental_parties")
    .select("*")
    .is("deleted_at", null);
  query =
    sort === "newest"
      ? query.order("created_at", { ascending: false })
      : query.order("name");
  // match by name or phone (strip PostgREST filter syntax chars)
  const safe = q.replace(/[,()"]/g, " ").trim();
  if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  const { data } = await query;
  return (data as Party[]) ?? [];
}

export default function PartiesPage() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const sort = searchParams.get("sort") ?? "name";
  const t = useTranslations("parties");
  const tc = useTranslations("common");

  const { data: parties, loading } = useQuery(
    () => loadParties(q, sort),
    [q, sort],
  );

  return (
    <div>
      <PageHeader
        title={t("title")}
        action={
          <Link
            to="/parties/new"
            className="flex min-h-10 items-center gap-1 rounded-app bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("new")}
          </Link>
        }
      />
      <FilterBar
        placeholder={tc("search")}
        showDates={false}
        sortOptions={[
          { value: "name", label: tc("byName") },
          { value: "newest", label: tc("newestFirst") },
        ]}
      />
      {loading ? (
        <ListSkeleton />
      ) : (parties ?? []).length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {(parties ?? []).map((party) => (
            <Link key={party.id} to={`/parties/${party.id}`} className="block">
              <Card interactive className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {party.name}
                    {party.kind !== "customer" && (
                      <Badge className="bg-sky-100 text-[10px] text-sky-800">
                        {party.kind === "supplier"
                          ? t("kindSupplier")
                          : t("kindBoth")}
                      </Badge>
                    )}
                  </div>
                  {party.phone && (
                    <div className="text-xs text-muted">{party.phone}</div>
                  )}
                </div>
                <Icon name="users" className="h-5 w-5 text-muted" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
