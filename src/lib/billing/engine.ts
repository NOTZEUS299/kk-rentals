import type { RateRule } from "../types";
import { evaluateFormula } from "./formula";

/**
 * Rent engine. Rentals are an append-only stream of issue/return
 * movements; rent is computed by matching returns against issues
 * FIFO per item, then charging each matched chunk through the
 * item's configurable rate rule.
 */

export interface Movement {
  itemId: string;
  type: "issue" | "return";
  date: string; // yyyy-mm-dd
  qty: number;
  rate: number | null; // snapshot on issue lines
}

/**
 * The engine only knows issue/return. Borrowing from a supplier is
 * the same FIFO stream from their point of view: borrow behaves
 * like an issue (clock starts), giveback like a return. Returns
 * null for challan types that don't belong to the given direction.
 */
export function toMovementType(
  challanType: string,
  direction: "receivable" | "payable",
): "issue" | "return" | null {
  if (direction === "receivable") {
    if (challanType === "issue") return "issue";
    if (challanType === "return") return "return";
    return null;
  }
  if (challanType === "borrow") return "issue";
  if (challanType === "giveback") return "return";
  return null;
}

export interface ItemBillingInfo {
  rule: RateRule;
  defaultRate: number;
}

export interface RentChunk {
  itemId: string;
  qty: number;
  rate: number;
  from: string;
  to: string;
  days: number;
  amount: number;
  open: boolean; // still on rent (charged till asOf)
}

export interface RentResult {
  chunks: RentChunk[];
  total: number;
}

export interface RentOptions {
  /** count both issue and return day (default true) */
  countReturnDay?: boolean;
}

export function rentalDays(
  from: string,
  to: string,
  countReturnDay = true,
): number {
  const ms = Date.parse(to) - Date.parse(from);
  const diff = Math.round(ms / 86_400_000);
  return Math.max(1, countReturnDay ? diff + 1 : diff);
}

export function chunkRent(
  rule: RateRule,
  qty: number,
  rate: number,
  days: number,
): number {
  switch (rule.type) {
    case "per_day":
      return qty * rate * days;
    case "per_month":
      return (qty * rate * days) / (rule.daysPerMonth ?? 30);
    case "min_days":
      return qty * rate * Math.max(days, rule.minDays);
    case "custom":
      return evaluateFormula(rule.formula, { qty, rate, days });
  }
}

/**
 * Merge item defaults with per-party overrides (party_item_rates).
 * A null override field falls back to the item's own value.
 */
export function resolveBillingInfo(
  items: { id: string; default_rate: number; rate_rule: RateRule | null }[],
  overrides: {
    item_id: string;
    rate: number | null;
    rate_rule: RateRule | null;
  }[] = [],
): Record<string, ItemBillingInfo> {
  const byItem = new Map(overrides.map((o) => [o.item_id, o]));
  const info: Record<string, ItemBillingInfo> = {};
  for (const item of items) {
    const override = byItem.get(item.id);
    info[item.id] = {
      rule: override?.rate_rule ?? item.rate_rule ?? { type: "per_day" },
      defaultRate: Number(override?.rate ?? item.default_rate),
    };
  }
  return info;
}

export function computeRent(
  movements: Movement[],
  items: Record<string, ItemBillingInfo>,
  asOf: string,
  opts: RentOptions = {},
): RentResult {
  const countReturnDay = opts.countReturnDay ?? true;
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));

  // FIFO queue of open issues per item
  const open = new Map<string, { date: string; qtyLeft: number; rate: number }[]>();
  const chunks: RentChunk[] = [];

  const infoFor = (itemId: string): ItemBillingInfo =>
    items[itemId] ?? { rule: { type: "per_day" }, defaultRate: 0 };

  for (const mv of sorted) {
    const info = infoFor(mv.itemId);
    if (mv.type === "issue") {
      const queue = open.get(mv.itemId) ?? [];
      queue.push({
        date: mv.date,
        qtyLeft: mv.qty,
        rate: mv.rate ?? info.defaultRate,
      });
      open.set(mv.itemId, queue);
    } else {
      let toReturn = mv.qty;
      const queue = open.get(mv.itemId) ?? [];
      while (toReturn > 0 && queue.length > 0) {
        const head = queue[0];
        const consumed = Math.min(head.qtyLeft, toReturn);
        const days = rentalDays(head.date, mv.date, countReturnDay);
        chunks.push({
          itemId: mv.itemId,
          qty: consumed,
          rate: head.rate,
          from: head.date,
          to: mv.date,
          days,
          amount: chunkRent(info.rule, consumed, head.rate, days),
          open: false,
        });
        head.qtyLeft -= consumed;
        toReturn -= consumed;
        if (head.qtyLeft <= 0) queue.shift();
      }
      // over-return (device conflict / data entry gap): charge nothing,
      // it will surface as negative outstanding in reports
    }
  }

  // whatever is still out is charged till asOf
  for (const [itemId, queue] of open) {
    const info = infoFor(itemId);
    for (const head of queue) {
      if (head.qtyLeft <= 0) continue;
      const days = rentalDays(head.date, asOf, countReturnDay);
      chunks.push({
        itemId,
        qty: head.qtyLeft,
        rate: head.rate,
        from: head.date,
        to: asOf,
        days,
        amount: chunkRent(info.rule, head.qtyLeft, head.rate, days),
        open: true,
      });
    }
  }

  const total = chunks.reduce((sum, c) => sum + c.amount, 0);
  return { chunks, total: Math.round(total * 100) / 100 };
}
