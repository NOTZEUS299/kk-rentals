/**
 * Module registry. Every feature area registers itself here;
 * navigation and routes are shown only when the tenant's plan
 * (or per-tenant extras) enables the module — see enabled_modules()
 * in the database and getEnabledModules() in lib/auth.
 */

export type IconName =
  | "home"
  | "users"
  | "package"
  | "receipt"
  | "wallet"
  | "truck"
  | "chart";

export interface NavItem {
  href: string;
  labelKey: string; // key inside the 'nav' messages namespace
  icon: IconName;
}

export interface ModuleDef {
  key: string;
  nav: NavItem[];
}

export const MODULE_DEFS: ModuleDef[] = [
  {
    key: "rentals",
    nav: [
      { href: "/parties", labelKey: "parties", icon: "users" },
      { href: "/items", labelKey: "items", icon: "package" },
      { href: "/challans", labelKey: "challans", icon: "receipt" },
      { href: "/drivers", labelKey: "drivers", icon: "truck" },
    ],
  },
  {
    key: "billing",
    nav: [{ href: "/billing", labelKey: "billing", icon: "wallet" }],
  },
  {
    key: "reports",
    nav: [{ href: "/reports", labelKey: "reports", icon: "chart" }],
  },
];

export function navForModules(enabled: Set<string>): NavItem[] {
  const items: NavItem[] = [{ href: "/", labelKey: "dashboard", icon: "home" }];
  for (const mod of MODULE_DEFS) {
    if (enabled.has(mod.key)) items.push(...mod.nav);
  }
  return items;
}

/**
 * Admin-managed access matrix (tenants.app_access) — the current
 * gating source. Route prefix → module key of the `rental` app; used
 * for both nav filtering and route guarding. Plan-based gating above
 * stays dormant until subscriptions are wired in.
 */
export const ROUTE_MODULES: Record<string, string> = {
  "/parties": "parties",
  "/items": "items",
  "/challans": "challans",
  "/drivers": "drivers",
  "/billing": "billing",
  "/reports": "reports",
};

/** Route → [module, submodule] for paths gated one level deeper. */
export const ROUTE_SUBMODULES: Record<string, [string, string]> = {
  "/reports/outstanding": ["reports", "outstanding"],
  "/reports/item-ledger": ["reports", "itemLedger"],
  "/reports/day-book": ["reports", "dayBook"],
  "/reports/due-on-rent": ["reports", "dueOnRent"],
  "/reports/monthly-activity": ["reports", "monthlyActivity"],
};

const ALL_NAV: NavItem[] = [
  { href: "/parties", labelKey: "parties", icon: "users" },
  { href: "/items", labelKey: "items", icon: "package" },
  { href: "/challans", labelKey: "challans", icon: "receipt" },
  { href: "/drivers", labelKey: "drivers", icon: "truck" },
  { href: "/billing", labelKey: "billing", icon: "wallet" },
  { href: "/reports", labelKey: "reports", icon: "chart" },
];

export function navForAccess(moduleOn: (mod: string) => boolean): NavItem[] {
  return [
    { href: "/", labelKey: "dashboard", icon: "home" },
    ...ALL_NAV.filter((item) => moduleOn(ROUTE_MODULES[item.href])),
  ];
}
