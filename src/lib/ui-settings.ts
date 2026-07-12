/**
 * Per-tenant UI composition, stored in tenants.ui_settings (jsonb) and
 * edited from the admin panel. Everything falls back to sensible
 * defaults, so a missing/partial document never breaks the app.
 *
 * NOTE: admin/src/lib/ui-settings.ts is a copy of this file — keep in sync.
 */

export const DASHBOARD_WIDGETS = [
  "hero",
  "stats",
  "quickActions",
  "overdueAlerts",
  "recentChallans",
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export const QUICK_ACTIONS = ["issue", "return", "borrow", "giveback"] as const;
export type QuickAction = (typeof QUICK_ACTIONS)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export interface UiSettings {
  dashboard: {
    /** widgets to render, in order */
    widgets: DashboardWidget[];
    /** which challan shortcuts appear in the quick-actions widget */
    quickActions: QuickAction[];
    /** rows in the recent-challans widget */
    recentCount: number;
  };
  density: Density;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboard: {
    widgets: ["hero", "stats", "quickActions", "overdueAlerts", "recentChallans"],
    quickActions: ["issue", "return"],
    recentCount: 5,
  },
  density: "comfortable",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse a raw jsonb document into validated settings (defaults merged). */
export function parseUiSettings(raw: unknown): UiSettings {
  const d = DEFAULT_UI_SETTINGS;
  if (!isRecord(raw)) return d;

  const dash = isRecord(raw.dashboard) ? raw.dashboard : {};

  const widgets = Array.isArray(dash.widgets)
    ? (dash.widgets.filter((w) =>
        (DASHBOARD_WIDGETS as readonly string[]).includes(String(w)),
      ) as DashboardWidget[])
    : d.dashboard.widgets;

  const quickActions = Array.isArray(dash.quickActions)
    ? (dash.quickActions.filter((a) =>
        (QUICK_ACTIONS as readonly string[]).includes(String(a)),
      ) as QuickAction[])
    : d.dashboard.quickActions;

  const rawCount = Number(dash.recentCount);
  const recentCount =
    Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 20
      ? rawCount
      : d.dashboard.recentCount;

  const density = (DENSITIES as readonly string[]).includes(
    String(raw.density),
  )
    ? (raw.density as Density)
    : d.density;

  return {
    dashboard: {
      // dedupe while keeping the configured order
      widgets: [...new Set(widgets)],
      quickActions: [...new Set(quickActions)],
      recentCount,
    },
    density,
  };
}
