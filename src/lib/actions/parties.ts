import { supabase } from "@/lib/supabase";
import { parseRateRule } from "@/lib/billing/parse-rule";
import { getFormFields, parseCustomFields } from "@/lib/custom-fields";
import type { RateRule } from "@/lib/types";

/** Client-side mutations for parties (were Next server actions). All
 * writes go through RLS — the browser session is the auth context. */

function partyFields(formData: FormData) {
  const kind = String(formData.get("kind") ?? "customer");
  return {
    name: String(formData.get("name") ?? "").trim(),
    kind: ["customer", "supplier", "both"].includes(kind) ? kind : "customer",
    phone: String(formData.get("phone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createParty(
  tenantId: string,
  formData: FormData,
): Promise<string | null> {
  const fields = partyFields(formData);
  if (!fields.name) return "name required";

  const cfDefs = await getFormFields(supabase, "party", tenantId);
  const { error } = await supabase.from("rental_parties").insert({
    ...fields,
    custom_fields: parseCustomFields(formData, cfDefs),
    tenant_id: tenantId,
  });
  return error ? error.message : null;
}

export async function updateParty(
  tenantId: string,
  id: string,
  formData: FormData,
): Promise<string | null> {
  const fields = partyFields(formData);
  if (!fields.name) return "name required";

  const cfDefs = await getFormFields(supabase, "party", tenantId);
  const { error } = await supabase
    .from("rental_parties")
    .update({ ...fields, custom_fields: parseCustomFields(formData, cfDefs) })
    .eq("id", id);
  return error ? error.message : null;
}

export async function deleteParty(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("rental_parties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}

/** Create or replace this party's rate/rule override for one item. */
export async function upsertPartyRate(args: {
  tenantId: string;
  firmId: string | null;
  partyId: string;
  formData: FormData;
}): Promise<string | null> {
  const { tenantId, firmId, partyId, formData } = args;

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return "invalid";

  const rateRaw = String(formData.get("rate") ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);

  // ruleType "inherit" keeps the item's own billing rule
  let rateRule: RateRule | null = null;
  if (String(formData.get("ruleType")) !== "inherit") {
    const parsed = parseRateRule(formData);
    if ("error" in parsed) return parsed.error;
    rateRule = parsed;
  }
  if (rate === null && rateRule === null) return "empty";

  // partial unique index (deleted_at is null) rules out PostgREST
  // upsert; do a manual find-then-write instead
  const { data: existing } = await supabase
    .from("rental_party_item_rates")
    .select("id")
    .eq("party_id", partyId)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("rental_party_item_rates")
        .update({ rate, rate_rule: rateRule })
        .eq("id", existing.id)
    : await supabase.from("rental_party_item_rates").insert({
        tenant_id: tenantId,
        firm_id: firmId,
        party_id: partyId,
        item_id: itemId,
        rate,
        rate_rule: rateRule,
      });
  return error ? error.message : null;
}

export async function deletePartyRate(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("rental_party_item_rates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}
