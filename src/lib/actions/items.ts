import { supabase } from "@/lib/supabase";
import { parseRateRule } from "@/lib/billing/parse-rule";
import { getFormFields, parseCustomFields } from "@/lib/custom-fields";
import { genMarko } from "@/lib/marko";

/** Client-side mutations for items + variants (were Next server actions). */

interface Ctx {
  tenantId: string;
  firmId: string | null;
  /** firm (or tenant) name used to derive a default owned mark */
  markoSource: string;
}

function itemFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    unit: String(formData.get("unit") ?? "pcs").trim() || "pcs",
    total_qty: Number(formData.get("totalQty") ?? 0) || 0,
    default_rate: Number(formData.get("rate") ?? 0) || 0,
    marko: String(formData.get("marko") ?? "").trim() || null,
  };
}

export async function createItem(
  ctx: Ctx,
  formData: FormData,
): Promise<string | null> {
  const fields = itemFields(formData);
  if (!fields.name) return "name";

  // generate a default owned mark when none was entered
  if (!fields.marko) fields.marko = genMarko(ctx.markoSource) || null;

  const rule = parseRateRule(formData);
  if ("error" in rule) return rule.error;

  const cfDefs = await getFormFields(supabase, "item", ctx.tenantId);
  const { data: created, error } = await supabase
    .from("rental_items")
    .insert({
      ...fields,
      rate_rule: rule,
      custom_fields: parseCustomFields(formData, cfDefs),
      tenant_id: ctx.tenantId,
      firm_id: ctx.firmId,
    })
    .select("id")
    .single();
  if (error) return error.message;

  // opening balance goes into the stock history too
  if (fields.total_qty > 0) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("rental_stock_entries").insert({
      tenant_id: ctx.tenantId,
      firm_id: ctx.firmId,
      item_id: created.id,
      kind: "initial",
      qty_delta: fields.total_qty,
      created_by: u.user?.id ?? null,
    });
  }
  return null;
}

export async function updateItem(
  tenantId: string,
  id: string,
  formData: FormData,
): Promise<string | null> {
  const fields = itemFields(formData);
  if (!fields.name) return "name";

  const rule = parseRateRule(formData);
  if ("error" in rule) return rule.error;

  // owned qty is NOT edited here — it moves only through adjustStock
  // so every change lands in the stock history
  const { total_qty: _ignored, ...rest } = fields;
  void _ignored;

  const cfDefs = await getFormFields(supabase, "item", tenantId);
  const { error } = await supabase
    .from("rental_items")
    .update({
      ...rest,
      rate_rule: rule,
      custom_fields: parseCustomFields(formData, cfDefs),
    })
    .eq("id", id);
  return error ? error.message : null;
}

/**
 * Atomic owned-stock change + audit row via the adjust_stock RPC.
 * Positive delta = stock added, negative = removed/written off.
 */
export async function adjustStock(args: {
  itemId: string;
  variantId: string | null;
  delta: number;
  kind: "add" | "remove" | "correction" | "writeoff";
  unitPrice?: number | null;
  notes?: string | null;
}): Promise<string | null> {
  if (!args.delta) return "zero delta";
  const { error } = await supabase.rpc("adjust_stock", {
    p_item: args.itemId,
    p_variant: args.variantId,
    p_delta: args.delta,
    p_kind: args.kind,
    p_unit_price: args.unitPrice ?? null,
    p_notes: args.notes ?? null,
  });
  return error ? error.message : null;
}

export async function deleteItem(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("rental_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}

// ------------------------------------------------------------
// Variants — sub-types of an item, each with its own owned stock.
// ------------------------------------------------------------

export async function createVariant(
  ctx: Pick<Ctx, "tenantId" | "firmId">,
  itemId: string,
  formData: FormData,
): Promise<string | null> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return "name";
  const rateRaw = String(formData.get("rate") ?? "").trim();
  const totalQty = Number(formData.get("totalQty") ?? 0) || 0;

  const { data: created, error } = await supabase
    .from("rental_item_variants")
    .insert({
      tenant_id: ctx.tenantId,
      firm_id: ctx.firmId,
      item_id: itemId,
      name,
      total_qty: totalQty,
      default_rate: rateRaw === "" ? null : Number(rateRaw),
      marko: String(formData.get("marko") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) return error.message;

  if (totalQty > 0) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("rental_stock_entries").insert({
      tenant_id: ctx.tenantId,
      firm_id: ctx.firmId,
      item_id: itemId,
      variant_id: created.id,
      kind: "initial",
      qty_delta: totalQty,
      created_by: u.user?.id ?? null,
    });
  }
  return null;
}

export async function updateVariant(
  itemId: string,
  id: string,
  oldQty: number,
  formData: FormData,
): Promise<string | null> {
  const rateRaw = String(formData.get("rate") ?? "").trim();
  const newQty = Number(formData.get("totalQty") ?? 0) || 0;

  // qty changes go through adjust_stock so the history stays complete
  const { error } = await supabase
    .from("rental_item_variants")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      default_rate: rateRaw === "" ? null : Number(rateRaw),
      marko: String(formData.get("marko") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) return error.message;

  if (newQty !== oldQty) {
    return adjustStock({
      itemId,
      variantId: id,
      delta: newQty - oldQty,
      kind: "correction",
    });
  }
  return null;
}

export async function deleteVariant(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("rental_item_variants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}
