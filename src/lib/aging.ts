/**
 * Per-party open rental position (aging), shared by the outstanding
 * report, the due-on-rent report and the dashboard overdue widget.
 * All rent math goes through the billing engine — never duplicated.
 */
import {
  computeRent,
  resolveBillingInfo,
  toMovementType,
  type Movement,
} from "@/lib/billing/engine";
import { todayISO } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Item, Party, PartyItemRate } from "@/lib/types";

/** One party's open rental position. */
export interface AgingRow {
  party: Party;
  qtyOut: number;
  rentAccrued: number;
  received: number;
  /** oldest open issue date — how long material has been sitting out */
  oldestFrom: string | null;
}

interface ChallanRow {
  party_id: string;
  type: string;
  challan_date: string;
  challan_lines: {
    item_id: string;
    qty: number;
    rate: number | null;
    deleted_at: string | null;
  }[];
}

export async function loadAging(
  tenantSettings: { countReturnDay?: boolean },
  firmId: string | null,
): Promise<AgingRow[]> {
  let challansQ = supabase
    .from("rental_challans")
    .select("party_id, type, challan_date, challan_lines:rental_challan_lines(item_id, qty, rate, deleted_at)")
    .is("deleted_at", null)
    .order("challan_date");
  let itemsQ = supabase.from("rental_items").select("*").is("deleted_at", null);
  let paymentsQ = supabase
    .from("rental_payments")
    .select("party_id, type, amount")
    .is("deleted_at", null);
  if (firmId) {
    challansQ = challansQ.eq("firm_id", firmId);
    itemsQ = itemsQ.eq("firm_id", firmId);
    paymentsQ = paymentsQ.eq("firm_id", firmId);
  }

  const [
    { data: parties },
    { data: challans },
    { data: items },
    { data: rates },
    { data: payments },
  ] = await Promise.all([
    supabase.from("rental_parties").select("*").is("deleted_at", null),
    challansQ,
    itemsQ,
    supabase.from("rental_party_item_rates").select("*").is("deleted_at", null),
    paymentsQ,
  ]);

  const ratesByParty = new Map<string, PartyItemRate[]>();
  for (const r of (rates as PartyItemRate[]) ?? []) {
    const arr = ratesByParty.get(r.party_id) ?? [];
    arr.push(r);
    ratesByParty.set(r.party_id, arr);
  }

  const movementsByParty = new Map<string, Movement[]>();
  for (const ch of (challans as unknown as ChallanRow[]) ?? []) {
    const type = toMovementType(ch.type, "receivable");
    if (!type) continue;
    const arr = movementsByParty.get(ch.party_id) ?? [];
    for (const line of ch.challan_lines) {
      if (line.deleted_at) continue;
      arr.push({
        itemId: line.item_id,
        type,
        date: ch.challan_date,
        qty: Number(line.qty),
        rate: line.rate === null ? null : Number(line.rate),
      });
    }
    movementsByParty.set(ch.party_id, arr);
  }

  const receivedByParty = new Map<string, number>();
  for (const p of (payments as { party_id: string; type: string; amount: number }[]) ?? []) {
    const sign = p.type === "receipt" ? 1 : p.type === "refund" ? -1 : 0;
    if (!sign) continue;
    receivedByParty.set(
      p.party_id,
      (receivedByParty.get(p.party_id) ?? 0) + sign * Number(p.amount),
    );
  }

  const asOf = todayISO();
  const countReturnDay = tenantSettings.countReturnDay ?? true;
  const rows: AgingRow[] = [];
  for (const party of (parties as Party[]) ?? []) {
    const movements = movementsByParty.get(party.id);
    if (!movements || movements.length === 0) continue;
    const billingInfo = resolveBillingInfo(
      (items as Item[]) ?? [],
      ratesByParty.get(party.id) ?? [],
    );
    const rent = computeRent(movements, billingInfo, asOf, { countReturnDay });
    const openChunks = rent.chunks.filter((c) => c.open);
    if (openChunks.length === 0) continue;
    rows.push({
      party,
      qtyOut: openChunks.reduce((s, c) => s + c.qty, 0),
      rentAccrued: rent.total,
      received: receivedByParty.get(party.id) ?? 0,
      oldestFrom: openChunks.reduce<string | null>(
        (min, c) => (min === null || c.from < min ? c.from : min),
        null,
      ),
    });
  }
  // biggest exposure first
  rows.sort((a, b) => b.rentAccrued - b.received - (a.rentAccrued - a.received));
  return rows;
}

/** Whole days material has been out, from the oldest open issue date. */
export function daysOnRent(oldestFrom: string | null, asOf = todayISO()): number {
  if (!oldestFrom) return 0;
  const ms = new Date(asOf).getTime() - new Date(oldestFrom).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** Badge severity per demo thresholds: >90d red, >60d orange, else amber. */
export function agingSeverity(days: number): "amber" | "orange" | "red" {
  if (days > 90) return "red";
  if (days > 60) return "orange";
  return "amber";
}

export const AGING_BADGE: Record<ReturnType<typeof agingSeverity>, string> = {
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};
