import { useState } from "react";
import { useLocale, useTranslations } from "@/i18n";
import { fmtDate, fmtMoney } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/lib/use-query";
import type { ChallanType, Item, StockEntry } from "@/lib/types";
import { firmsActive, useTenantSession } from "@/session";
import { CHALLAN_BADGE } from "@/lib/challan-badge";
import {
  Card,
  EmptyState,
  Label,
  ListSkeleton,
  PageHeader,
  Select,
} from "@/components/ui";

/** One chronological row of the item's movement history. */
interface LedgerRow {
  date: string;
  /** signed change to stock in hand */
  delta: number;
  kind: "stock" | "challan";
  label: string;
  detail: string;
  badge?: ChallanType;
}

interface MovementRow {
  qty: number;
  challans: {
    type: ChallanType;
    challan_no: string | null;
    challan_date: string;
    deleted_at: string | null;
    parties: { name: string } | null;
  } | null;
}

async function loadItems(firmId: string | null): Promise<Item[]> {
  let q = supabase.from("rental_items").select("*").is("deleted_at", null).order("name");
  if (firmId) q = q.eq("firm_id", firmId);
  const { data } = await q;
  return (data as Item[]) ?? [];
}

/** issue/giveback take stock out of hand; return/borrow bring it in */
const CHALLAN_SIGN: Record<ChallanType, number> = {
  issue: -1,
  return: 1,
  borrow: 1,
  giveback: -1,
};

async function loadLedger(itemId: string): Promise<LedgerRow[]> {
  const [{ data: entries }, { data: movements }] = await Promise.all([
    supabase
      .from("rental_stock_entries")
      .select("*")
      .eq("item_id", itemId)
      .is("deleted_at", null),
    supabase
      .from("rental_challan_lines")
      .select(
        "qty, challans:rental_challans!inner(type, challan_no, challan_date, deleted_at, parties:rental_parties(name))",
      )
      .eq("item_id", itemId)
      .is("deleted_at", null),
  ]);

  const rows: LedgerRow[] = [];
  for (const en of (entries as StockEntry[]) ?? []) {
    rows.push({
      date: en.created_at.slice(0, 10),
      delta: Number(en.qty_delta),
      kind: "stock",
      label: en.kind,
      detail: [
        en.unit_price != null ? fmtMoney(Number(en.unit_price)) : null,
        en.notes,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const m of (movements as unknown as MovementRow[]) ?? []) {
    const ch = m.challans;
    if (!ch || ch.deleted_at) continue;
    rows.push({
      date: ch.challan_date,
      delta: CHALLAN_SIGN[ch.type] * Number(m.qty),
      kind: "challan",
      label: ch.challan_no ?? "—",
      detail: ch.parties?.name ?? "",
      badge: ch.type,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

export default function ItemLedgerPage() {
  const t = useTranslations("reports");
  const ti = useTranslations("items");
  const tch = useTranslations("challans");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { tenant, firm } = useTenantSession();
  const firmId = firmsActive(tenant) ? (firm?.id ?? null) : null;
  const [itemId, setItemId] = useState("");

  const { data: items } = useQuery(() => loadItems(firmId), [firmId]);
  const { data: rows, loading } = useQuery(
    () => (itemId ? loadLedger(itemId) : Promise.resolve([])),
    [itemId],
  );

  return (
    <div>
      <PageHeader title={t("itemLedger")} />
      <div className="mb-3">
        <Label htmlFor="item">{ti("title")}</Label>
        <Select
          id="item"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">{tch("selectItem")}</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </div>

      {!itemId ? null : loading ? (
        <ListSkeleton />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState message={tc("noData")} />
      ) : (
        <div className="space-y-2">
          {(rows ?? []).map((row, i) => (
            <Card key={i} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {row.kind === "stock" ? ti(`stock_${row.label}`) : row.label}
                  {row.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CHALLAN_BADGE[row.badge]}`}
                    >
                      {tch(row.badge)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {fmtDate(row.date, locale)}
                  {row.detail && <> · {row.detail}</>}
                </div>
              </div>
              <span
                className={`text-sm font-bold ${row.delta > 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {row.delta > 0 ? "+" : ""}
                {row.delta}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
