import { supabase } from "@/lib/supabase";
import { getFormFields, parseCustomFields } from "@/lib/custom-fields";

/** Client-side mutations for drivers (were Next server actions). */

function driverFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    license_no: String(formData.get("licenseNo") ?? "").trim() || null,
    vehicle_no: String(formData.get("vehicleNo") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createDriver(
  tenantId: string,
  formData: FormData,
): Promise<string | null> {
  const fields = driverFields(formData);
  if (!fields.name) return "name required";

  const cfDefs = await getFormFields(supabase, "driver", tenantId);
  const { error } = await supabase.from("rental_drivers").insert({
    ...fields,
    custom_fields: parseCustomFields(formData, cfDefs),
    tenant_id: tenantId,
  });
  return error ? error.message : null;
}

export async function updateDriver(
  tenantId: string,
  id: string,
  formData: FormData,
): Promise<string | null> {
  const fields = driverFields(formData);
  if (!fields.name) return "name required";

  const cfDefs = await getFormFields(supabase, "driver", tenantId);
  const { error } = await supabase
    .from("rental_drivers")
    .update({ ...fields, custom_fields: parseCustomFields(formData, cfDefs) })
    .eq("id", id);
  return error ? error.message : null;
}

/**
 * Dynamic driver entry: resolve a typed name to an existing driver
 * (case-insensitive) or create one on the fly. Returns the driver id,
 * or null for an empty name. Used by the challan form combobox.
 */
export async function ensureDriver(
  tenantId: string,
  name: string,
): Promise<{ id: string | null; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { id: null };

  const { data: existing } = await supabase
    .from("rental_drivers")
    .select("id")
    .ilike("name", trimmed)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error } = await supabase
    .from("rental_drivers")
    .insert({ tenant_id: tenantId, name: trimmed })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: created.id };
}

export async function deleteDriver(id: string): Promise<string | null> {
  const { error } = await supabase
    .from("rental_drivers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}
