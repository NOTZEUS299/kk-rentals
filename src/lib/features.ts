/**
 * Per-tenant feature matrix, stored in tenants.features (jsonb) and
 * edited from the admin panel. Everything defaults to ENABLED /
 * VISIBLE, so an empty document changes nothing.
 *
 * NOTE: admin/src/lib/features.ts is a copy of this file — keep in sync.
 */

export const FUNCTION_KEYS = [
  "charges",
  "deposits",
  "billBooks",
  "variants",
  "borrow",
  "formulaBilling",
  "customFields",
  "drivers",
] as const;
export type FunctionKey = (typeof FUNCTION_KEYS)[number];

export const LEDGER_KEYS = ["party", "item", "dayBook"] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];

/** Core form fields the admin may hide, per entity. */
export const HIDEABLE_FIELDS = {
  party: ["kind", "phone", "address", "notes"],
  item: ["unit", "marko", "rateRule"],
  driver: ["phone", "license", "vehicle", "notes"],
  challan: ["driver", "vehicle", "notes"],
} as const;
export type FieldEntity = keyof typeof HIDEABLE_FIELDS;

export interface TenantFeatures {
  functions: Record<FunctionKey, boolean>;
  ledgers: Record<LedgerKey, boolean>;
  hiddenFields: Record<FieldEntity, string[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse a raw jsonb document into a full matrix (defaults merged). */
export function parseFeatures(raw: unknown): TenantFeatures {
  const doc = isRecord(raw) ? raw : {};
  const fns = isRecord(doc.functions) ? doc.functions : {};
  const led = isRecord(doc.ledgers) ? doc.ledgers : {};
  const hid = isRecord(doc.hiddenFields) ? doc.hiddenFields : {};

  const functions = Object.fromEntries(
    FUNCTION_KEYS.map((k) => [k, fns[k] !== false]),
  ) as Record<FunctionKey, boolean>;
  const ledgers = Object.fromEntries(
    LEDGER_KEYS.map((k) => [k, led[k] !== false]),
  ) as Record<LedgerKey, boolean>;
  const hiddenFields = Object.fromEntries(
    (Object.keys(HIDEABLE_FIELDS) as FieldEntity[]).map((e) => [
      e,
      Array.isArray(hid[e])
        ? (hid[e] as unknown[])
            .map(String)
            .filter((f) =>
              (HIDEABLE_FIELDS[e] as readonly string[]).includes(f),
            )
        : [],
    ]),
  ) as Record<FieldEntity, string[]>;

  return { functions, ledgers, hiddenFields };
}

/** Serialize back to the compact stored form (only disabled/hidden). */
export function packFeatures(f: TenantFeatures): Record<string, unknown> {
  const functions = Object.fromEntries(
    Object.entries(f.functions).filter(([, v]) => v === false),
  );
  const ledgers = Object.fromEntries(
    Object.entries(f.ledgers).filter(([, v]) => v === false),
  );
  const hiddenFields = Object.fromEntries(
    Object.entries(f.hiddenFields).filter(([, v]) => v.length > 0),
  );
  const out: Record<string, unknown> = {};
  if (Object.keys(functions).length) out.functions = functions;
  if (Object.keys(ledgers).length) out.ledgers = ledgers;
  if (Object.keys(hiddenFields).length) out.hiddenFields = hiddenFields;
  return out;
}
