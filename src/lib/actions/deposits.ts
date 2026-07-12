import { supabase } from "@/lib/supabase";

/** Client-side mutations for security deposits. */

export async function addDeposit(args: {
  tenantId: string;
  firmId: string | null;
  userId: string;
  partyId: string;
  amount: number;
  method?: string;
  challanId?: string | null;
  itemId?: string | null;
  notes?: string | null;
}): Promise<string | null> {
  if (!(args.amount > 0)) return "amount";
  const { error } = await supabase.from("rental_deposits").insert({
    tenant_id: args.tenantId,
    firm_id: args.firmId,
    party_id: args.partyId,
    challan_id: args.challanId ?? null,
    item_id: args.itemId ?? null,
    amount: args.amount,
    method: args.method ?? "cash",
    notes: args.notes ?? null,
    created_by: args.userId,
  });
  return error ? error.message : null;
}

/** Close a held deposit: give it back (refunded) or keep it against dues (adjusted). */
export async function resolveDeposit(
  id: string,
  status: "refunded" | "adjusted",
): Promise<string | null> {
  const { error } = await supabase
    .from("rental_deposits")
    .update({ status, resolved_date: new Date().toISOString().slice(0, 10) })
    .eq("id", id)
    .eq("status", "held");
  return error ? error.message : null;
}
