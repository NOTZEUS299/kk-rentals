import type { SupabaseClient } from "@supabase/supabase-js";

/** Entities that can carry admin-defined custom fields. */
export type FormEntity = "party" | "item" | "driver" | "challan" | "payment";

export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "textarea";

export const CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
  "textarea",
];

export const FORM_ENTITIES: readonly FormEntity[] = [
  "party",
  "item",
  "driver",
  "challan",
  "payment",
];

/** One field of a tenant's dynamic form (form_definitions.fields[]). */
export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  /** choices for type "select" */
  options?: string[];
}

export type CustomFieldValues = Record<string, string | number | boolean | null>;

/** "Site Name (2)" -> "site_name_2" */
export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Keep only well-formed field defs (defensive: fields come from jsonb). */
export function sanitizeFieldDefs(raw: unknown): CustomFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const type = o.type as CustomFieldType;
    if (!key || !label || !CUSTOM_FIELD_TYPES.includes(type)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label,
      type,
      required: o.required === true,
      options:
        type === "select" && Array.isArray(o.options)
          ? o.options.filter((x): x is string => typeof x === "string")
          : undefined,
    });
  }
  return out;
}

/** Coerce one raw value to the field's storage type. */
export function normalizeCustomValue(
  def: CustomFieldDef,
  raw: unknown,
): string | number | boolean | null {
  switch (def.type) {
    case "checkbox":
      return raw === true || raw === "on" || raw === "true";
    case "number": {
      const s = String(raw ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    case "select": {
      const s = String(raw ?? "").trim();
      return s && (def.options ?? []).includes(s) ? s : null;
    }
    default: {
      const s = String(raw ?? "").trim();
      return s || null;
    }
  }
}

/** Read cf_<key> inputs of a submitted form into a jsonb-ready bag. */
export function parseCustomFields(
  formData: FormData,
  defs: CustomFieldDef[],
): CustomFieldValues {
  const out: CustomFieldValues = {};
  for (const def of defs) {
    out[def.key] = normalizeCustomValue(def, formData.get(`cf_${def.key}`));
  }
  return out;
}

/** Same, for JSON payloads (client-built submits like the challan form). */
export function normalizeCustomPayload(
  defs: CustomFieldDef[],
  payload: Record<string, unknown> | undefined,
): CustomFieldValues {
  const out: CustomFieldValues = {};
  for (const def of defs) {
    out[def.key] = normalizeCustomValue(def, payload?.[def.key]);
  }
  return out;
}

/** The tenant's admin-defined fields for one entity ([] when none).
 *  tenantId must be the caller's own tenant — passed explicitly so the
 *  query is always correctly scoped regardless of RLS context.
 */
export async function getFormFields(
  supabase: SupabaseClient,
  entity: FormEntity,
  tenantId: string,
): Promise<CustomFieldDef[]> {
  const { data } = await supabase
    .from("form_definitions")
    .select("fields")
    .eq("tenant_id", tenantId)
    .eq("entity", entity)
    .maybeSingle();
  return sanitizeFieldDefs(data?.fields);
}
