import { supabase } from "@/lib/supabase";
import { getFormFields, parseCustomFields } from "@/lib/custom-fields";

/** Client-side payment mutation (was a Next server action). */
export async function addPayment(args: {
  tenantId: string;
  firmId: string | null;
  userId: string;
  partyId: string;
  formData: FormData;
}): Promise<string | null> {
  const { tenantId, firmId, userId, partyId, formData } = args;

  const amount = Number(formData.get("amount") ?? 0);
  if (!(amount > 0)) return "amount";

  // receipt = customer pays us; paid = we pay a supplier
  const rawType = String(formData.get("type") ?? "receipt");
  const type = ["receipt", "refund", "paid"].includes(rawType)
    ? rawType
    : "receipt";

  const { error } = await supabase.from("rental_payments").insert({
    tenant_id: tenantId,
    firm_id: firmId,
    party_id: partyId,
    type,
    amount,
    method: String(formData.get("method") ?? "cash"),
    payment_date:
      String(formData.get("date") ?? "") ||
      new Date().toISOString().slice(0, 10),
    notes: String(formData.get("notes") ?? "").trim() || null,
    custom_fields: parseCustomFields(
      formData,
      await getFormFields(supabase, "payment", tenantId),
    ),
    created_by: userId,
  });
  return error ? error.message : null;
}
