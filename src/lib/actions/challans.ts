import { supabase } from "@/lib/supabase";
import { getFormFields, normalizeCustomPayload } from "@/lib/custom-fields";
import type { ChallanType } from "@/lib/types";

export interface ChallanPayload {
  partyId: string;
  type: ChallanType;
  date: string;
  notes: string;
  driverId: string | null;
  vehicleNo: string;
  /** admin-defined custom field values, keyed by field key */
  customFields?: Record<string, string | boolean>;
  lines: {
    itemId: string;
    variantId: string | null;
    qty: number;
    rate: number | null;
    marko: string | null;
    lotSupplierId: string | null;
  }[];
  /** extra fees; itemId set = line-level charge on that item's line */
  charges?: {
    chargeTypeId: string;
    amount: number;
    qty: number | null;
    itemId: string | null;
    notes: string | null;
  }[];
  /** security deposit collected with this challan */
  deposit?: { amount: number; method: string } | null;
  /** numbered series to draw the challan number from (null = default) */
  billBookId?: string | null;
}

export type StockErrorKind =
  | "STOCK_INSUFFICIENT"
  | "STOCK_OVER_RETURN"
  | "STOCK_OVER_GIVEBACK"
  | "STOCK_NOT_IN_HAND";

export type StockError = {
  kind: StockErrorKind;
  item: string;
  available: number;
  requested: number;
};

export type ChallanFormState =
  | { error: "stock"; stockError: StockError }
  | { error: string }
  | null;

/**
 * The DB raises: 'STOCK_INSUFFICIENT:item=Plates:available=40:requested=60'
 * Parse that into a typed object for the UI.
 */
function parseStockError(message: string): StockError | null {
  const kinds: readonly StockErrorKind[] = [
    "STOCK_INSUFFICIENT",
    "STOCK_OVER_RETURN",
    "STOCK_OVER_GIVEBACK",
    "STOCK_NOT_IN_HAND",
  ];
  const kind = kinds.find((k) => message.startsWith(k));
  if (!kind) return null;
  const parts = Object.fromEntries(
    message
      .split(":")
      .slice(1)
      .map((p) => p.split("=")),
  );
  return {
    kind,
    item: parts["item"] ?? "?",
    available: Number(parts["available"] ?? 0),
    requested: Number(parts["requested"] ?? 0),
  };
}

export interface ChallanCtx {
  tenantId: string;
  firmId: string | null;
  userId: string;
}

/** Returns null on success; the caller navigates. */
export async function createChallan(
  ctx: ChallanCtx,
  payload: ChallanPayload,
): Promise<ChallanFormState> {
  const { tenantId } = ctx;
  const lines = payload.lines.filter((l) => l.itemId && l.qty > 0);
  if (!payload.partyId || lines.length === 0) return { error: "invalid" };

  const { data: challanId, error } = await supabase.rpc("create_challan", {
    p_party: payload.partyId,
    p_type: payload.type,
    p_date: payload.date || null,
    p_notes: payload.notes,
    p_driver: payload.driverId || null,
    p_vehicle: payload.vehicleNo,
    p_bill_book: payload.billBookId ?? null,
    p_lines: lines.map((l) => ({
      itemId: l.itemId,
      variantId: l.variantId,
      qty: l.qty,
      // rate snapshot when material starts moving (out or borrowed in)
      rate:
        payload.type === "issue" || payload.type === "borrow" ? l.rate : null,
      marko: l.marko,
      lotSupplierId: l.lotSupplierId,
    })),
  });
  if (error) {
    const stockError = parseStockError(error.message);
    if (stockError) return { error: "stock", stockError };
    return { error: error.message };
  }

  // custom fields ride on the challan row; create_challan doesn't
  // know about them (keeps the RPC signature stable)
  const cfDefs = await getFormFields(supabase, "challan", tenantId);
  if (cfDefs.length > 0 && challanId) {
    await supabase
      .from("rental_challans")
      .update({
        custom_fields: normalizeCustomPayload(cfDefs, payload.customFields),
      })
      .eq("id", challanId as string);
  }

  // extra fees ride in challan_charges; line-level charges attach to
  // the first created line of their item (an item block may have
  // expanded into several lot lines — the charge is per item)
  const charges = (payload.charges ?? []).filter((c) => c.amount > 0);
  if (charges.length > 0 && challanId) {
    interface CreatedLine {
      id: string;
      item_id: string;
      variant_id: string | null;
    }
    let createdLines: CreatedLine[] = [];
    let lineIdByItem = new Map<string, string>();
    if (charges.some((c) => c.itemId)) {
      const { data } = await supabase
        .from("rental_challan_lines")
        .select("id, item_id, variant_id")
        .eq("challan_id", challanId as string);
      createdLines = (data as CreatedLine[]) ?? [];
      lineIdByItem = new Map(
        [...createdLines]
          .reverse() // keep the FIRST line per item after overwrites
          .map((l) => [l.item_id, l.id]),
      );
    }
    const { data: insertedCharges, error: chargeErr } = await supabase
      .from("rental_challan_charges")
      .insert(
        charges.map((c) => ({
          tenant_id: tenantId,
          challan_id: challanId as string,
          challan_line_id: c.itemId
            ? (lineIdByItem.get(c.itemId) ?? null)
            : null,
          charge_type_id: c.chargeTypeId,
          amount: c.amount,
          qty: c.qty,
          notes: c.notes,
        })),
      )
      .select("id, charge_type_id, qty, challan_line_id");
    // the challan itself was created — surface the charge failure
    if (chargeErr) return { error: `charges: ${chargeErr.message}` };

    // lost-item charges also write the qty off owned stock
    const typeIds = [...new Set(charges.map((c) => c.chargeTypeId))];
    const { data: typeRows } = await supabase
      .from("rental_charge_types")
      .select("id, affects_stock, name")
      .in("id", typeIds);
    const stockTypes = new Map(
      ((typeRows as { id: string; affects_stock: boolean; name: string }[]) ?? [])
        .filter((t) => t.affects_stock)
        .map((t) => [t.id, t.name]),
    );
    const lineById = new Map(createdLines.map((l) => [l.id, l]));
    for (const ch of (insertedCharges as {
      id: string;
      charge_type_id: string;
      qty: number | null;
      challan_line_id: string | null;
    }[]) ?? []) {
      const typeName = stockTypes.get(ch.charge_type_id);
      if (!typeName || !ch.qty || ch.qty <= 0 || !ch.challan_line_id) continue;
      const line = lineById.get(ch.challan_line_id);
      if (!line) continue;
      const { error: adjErr } = await supabase.rpc("adjust_stock", {
        p_item: line.item_id,
        p_variant: line.variant_id,
        p_delta: -ch.qty,
        p_kind: "writeoff",
        p_unit_price: null,
        p_notes: typeName,
        p_charge: ch.id,
      });
      if (adjErr) return { error: `writeoff: ${adjErr.message}` };
    }
  }

  // security deposit collected alongside the challan
  if (payload.deposit && payload.deposit.amount > 0 && challanId) {
    const { error: depErr } = await supabase.from("rental_deposits").insert({
      tenant_id: tenantId,
      firm_id: ctx.firmId,
      party_id: payload.partyId,
      challan_id: challanId as string,
      amount: payload.deposit.amount,
      method: payload.deposit.method,
      created_by: ctx.userId,
    });
    if (depErr) return { error: `deposit: ${depErr.message}` };
  }

  return null;
}
