import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAdoptLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import { parseAppAccess, type AppAccess } from "@/lib/app-access";
import { parseFeatures, type TenantFeatures } from "@/lib/features";
import { parseUiSettings, type UiSettings } from "@/lib/ui-settings";
import type { Firm, Profile, Tenant } from "@/lib/types";

export interface SessionState {
  /** true until the first auth + profile load settles */
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  tenant: Tenant | null;
  /** the firm the caller is currently working in (null if none) */
  firm: Firm | null;
  /** all firms of the tenant */
  firms: Firm[];
  /** modules enabled by the tenant's plan (enabled_modules() RPC) */
  modules: Set<string>;
  uiSettings: UiSettings;
  /** admin-managed fine-grained feature matrix */
  features: TenantFeatures;
  /** admin-managed app/module/submodule access */
  access: AppAccess;
  /** re-fetch profile/tenant/firms (after onboarding, firm switch…) */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

interface Loaded {
  userId: string | null;
  profile: Profile | null;
  tenant: Tenant | null;
  firm: Firm | null;
  firms: Firm[];
  modules: Set<string>;
}

const EMPTY: Loaded = {
  userId: null,
  profile: null,
  tenant: null,
  firm: null,
  firms: [],
  modules: new Set(),
};

async function loadContext(): Promise<Loaded> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let tenant: Tenant | null = null;
  let firms: Firm[] = [];
  let firm: Firm | null = null;
  let modules = new Set<string>();

  if (profile?.tenant_id) {
    const [{ data: tenantData }, { data: firmData }, { data: moduleData }] =
      await Promise.all([
        supabase
          .from("tenants")
          .select("*")
          .eq("id", profile.tenant_id)
          .maybeSingle(),
        supabase
          .from("firms")
          .select("*")
          .eq("tenant_id", profile.tenant_id)
          .is("deleted_at", null)
          .order("name"),
        supabase.rpc("enabled_modules"),
      ]);
    tenant = tenantData as Tenant | null;
    firms = (firmData as Firm[] | null) ?? [];
    firm =
      firms.find((f) => f.id === profile.current_firm_id) ??
      firms.find((f) => f.is_default) ??
      firms[0] ??
      null;
    modules = new Set<string>((moduleData as string[] | null) ?? []);
  }

  return {
    userId: user.id,
    profile: (profile as Profile | null) ?? null,
    tenant,
    firm,
    firms,
    modules,
  };
}

function applyTenantChrome(tenant: Tenant | null) {
  const html = document.documentElement;
  const vars = themeVars(tenant?.theme);
  // clear previously applied vars, then set the current tenant's
  for (const v of [
    "--primary",
    "--primary-foreground",
    "--background",
    "--foreground",
    "--card",
    "--muted",
    "--border",
    "--radius",
  ]) {
    html.style.removeProperty(v);
  }
  for (const [k, v] of Object.entries(vars)) {
    html.style.setProperty(k, v as string);
  }
  const ui = parseUiSettings(tenant?.ui_settings);
  html.setAttribute("data-density", ui.density);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Loaded>(EMPTY);
  const adoptLocale = useAdoptLocale();

  const refresh = useCallback(async () => {
    const next = await loadContext();
    setState(next);
    applyTenantChrome(next.tenant);
    // onboarding language preference (profile beats tenant) — applies
    // only until the user explicitly switches languages on this device
    adoptLocale(next.profile?.locale ?? next.tenant?.locale);
  }, [adoptLocale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await loadContext();
      if (cancelled) return;
      setState(next);
      applyTenantChrome(next.tenant);
      adoptLocale(next.profile?.locale ?? next.tenant?.locale);
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // defer: supabase-js deadlocks if we call its API inside the callback
        setTimeout(() => void refresh(), 0);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh, adoptLocale]);

  const uiSettings = useMemo(
    () => parseUiSettings(state.tenant?.ui_settings),
    [state.tenant],
  );
  const features = useMemo(
    () => parseFeatures(state.tenant?.features),
    [state.tenant],
  );
  const access = useMemo(
    () => parseAppAccess(state.tenant?.app_access),
    [state.tenant],
  );

  const value = useMemo<SessionState>(
    () => ({ loading, ...state, uiSettings, features, access, refresh }),
    [loading, state, uiSettings, features, access, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** Pages inside the app shell are guaranteed a tenant + user. */
export function useTenantSession() {
  const ctx = useSession();
  if (!ctx.userId || !ctx.tenant) {
    throw new Error("useTenantSession outside guarded route");
  }
  return { ...ctx, userId: ctx.userId, tenant: ctx.tenant };
}

/** True when the tenant runs more than one firm (any active mode). */
export function firmsActive(tenant: Tenant | null): boolean {
  return !!tenant && tenant.firm_mode !== "off";
}
