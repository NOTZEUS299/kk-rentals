/**
 * Per-tenant app / module / submodule access control, stored in
 * tenants.app_access (jsonb) and edited from the admin panel.
 * Default-on semantics: '{}' (or any missing key) means ENABLED, so
 * only disabled entries are stored. Independent of plans/subscriptions.
 *
 * NOTE: rental/src/lib/app-access.ts and construction/src/lib/app-access.ts
 * are copies of this file — keep all three in sync.
 */

export const APP_ACCESS_DEFS: Record<
  string,
  { label: string; modules: Record<string, { label: string; sub: Record<string, string> }> }
> = {
  rental: {
    label: "Rental (RentBook)",
    modules: {
      parties: { label: "Parties", sub: {} },
      items: { label: "Items", sub: {} },
      challans: {
        label: "Challans",
        sub: {
          issue: "Issue",
          return: "Return",
          borrow: "Borrow",
          giveback: "Give back",
        },
      },
      drivers: { label: "Drivers", sub: {} },
      billing: { label: "Billing", sub: {} },
      reports: {
        label: "Reports",
        sub: {
          outstanding: "Outstanding",
          itemLedger: "Item ledger",
          dayBook: "Day book",
          dueOnRent: "Due on rent",
          monthlyActivity: "Monthly activity",
        },
      },
    },
  },
  construction: {
    label: "Construction",
    modules: {
      sites: { label: "Sites", sub: { diary: "Site diary" } },
      documents: { label: "Documents", sub: {} },
      partners: { label: "Partners", sub: {} },
      suppliers: { label: "Suppliers", sub: {} },
      materials: { label: "Materials", sub: { dailyEntry: "Daily entry" } },
      workers: {
        label: "Workers",
        sub: { dailyPayment: "Daily payment", settlement: "Monthly settlement" },
      },
      rentals: { label: "Rentals", sub: { issue: "Issue", return: "Return" } },
      expenses: { label: "Expenses", sub: {} },
      billing: { label: "RA billing", sub: {} },
      invoicing: { label: "GST invoices", sub: {} },
      reports: { label: "Reports", sub: {} },
      settings: { label: "Settings", sub: {} },
    },
  },
};

export type AppKey = "rental" | "construction";

export interface ModuleAccess {
  enabled: boolean;
  sub: Record<string, boolean>;
}
export interface AppAccessEntry {
  enabled: boolean;
  modules: Record<string, ModuleAccess>;
}
export type AppAccess = Record<string, AppAccessEntry>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse the stored jsonb into a full matrix (defaults merged, all on). */
export function parseAppAccess(raw: unknown): AppAccess {
  const doc = isRecord(raw) ? raw : {};
  const out: AppAccess = {};
  for (const [appKey, def] of Object.entries(APP_ACCESS_DEFS)) {
    const rawApp = isRecord(doc[appKey]) ? (doc[appKey] as Record<string, unknown>) : {};
    const rawModules = isRecord(rawApp.modules) ? (rawApp.modules as Record<string, unknown>) : {};
    const modules: Record<string, ModuleAccess> = {};
    for (const [modKey, modDef] of Object.entries(def.modules)) {
      const rawMod = isRecord(rawModules[modKey]) ? (rawModules[modKey] as Record<string, unknown>) : {};
      const rawSub = isRecord(rawMod.sub) ? (rawMod.sub as Record<string, unknown>) : {};
      modules[modKey] = {
        enabled: rawMod.enabled !== false,
        sub: Object.fromEntries(
          Object.keys(modDef.sub).map((s) => [s, rawSub[s] !== false]),
        ),
      };
    }
    out[appKey] = { enabled: rawApp.enabled !== false, modules };
  }
  return out;
}

/** Serialize back to the compact stored form (only disabled entries). */
export function packAppAccess(access: AppAccess): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [appKey, app] of Object.entries(access)) {
    const packed: Record<string, unknown> = {};
    if (app.enabled === false) packed.enabled = false;
    const modules: Record<string, unknown> = {};
    for (const [modKey, mod] of Object.entries(app.modules)) {
      const m: Record<string, unknown> = {};
      if (mod.enabled === false) m.enabled = false;
      const sub = Object.fromEntries(
        Object.entries(mod.sub).filter(([, v]) => v === false),
      );
      if (Object.keys(sub).length) m.sub = sub;
      if (Object.keys(m).length) modules[modKey] = m;
    }
    if (Object.keys(modules).length) packed.modules = modules;
    if (Object.keys(packed).length) out[appKey] = packed;
  }
  return out;
}

export function appEnabled(a: AppAccess, app: AppKey): boolean {
  return a[app]?.enabled !== false;
}
export function moduleEnabled(a: AppAccess, app: AppKey, mod: string): boolean {
  return appEnabled(a, app) && a[app]?.modules[mod]?.enabled !== false;
}
export function subEnabled(
  a: AppAccess,
  app: AppKey,
  mod: string,
  sub: string,
): boolean {
  return moduleEnabled(a, app, mod) && a[app]?.modules[mod]?.sub[sub] !== false;
}
