import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { appEnabled, moduleEnabled, subEnabled } from "@/lib/app-access";
import {
  navForAccess,
  ROUTE_MODULES,
  ROUTE_SUBMODULES,
} from "@/lib/modules/registry";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/session";
import { AppNav } from "@/components/nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { FirmSwitcher } from "@/components/firm-switcher";
import { Icon } from "@/components/icons";
import { ListSkeleton } from "@/components/ui";

/** Signed-in app shell: header + nav + guarded outlet. */
export function AppLayout() {
  const { loading, userId, tenant, features, access } = useSession();
  const location = useLocation();
  const t = useTranslations("nav");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-18">
        <ListSkeleton />
      </div>
    );
  }
  if (!userId)
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (!tenant) return <Navigate to="/onboarding" replace />;

  // whole app switched off for this tenant by the admin
  if (!appEnabled(access, "rental")) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center p-4 text-center">
        <p className="text-sm text-muted">{t("appDisabled")}</p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="mx-auto mt-4 min-h-11 rounded-app border border-border px-4 text-sm font-medium"
        >
          {t("logout")}
        </button>
      </main>
    );
  }

  // module route guard (admin access matrix + submodule paths)
  const prefix = "/" + (location.pathname.split("/")[1] ?? "");
  const guardedModule = ROUTE_MODULES[prefix];
  const guardedSub = ROUTE_SUBMODULES[location.pathname];
  if (guardedModule && !moduleEnabled(access, "rental", guardedModule))
    return <Navigate to="/" replace />;
  if (guardedSub && !subEnabled(access, "rental", guardedSub[0], guardedSub[1]))
    return <Navigate to="/" replace />;

  // access matrix + fine-grained feature gates drive the nav
  const nav = navForAccess((mod) => moduleEnabled(access, "rental", mod)).filter(
    (item) => {
      if (item.href === "/drivers") return features.functions.drivers;
      if (item.href === "/billing") return features.ledgers.party;
      if (item.href === "/reports")
        return (
          features.ledgers.party ||
          features.ledgers.item ||
          features.ledgers.dayBook
        );
      return true;
    },
  );

  return (
    <div className="min-h-dvh">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur print:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-app bg-linear-to-br from-primary to-primary-strong text-sm font-bold text-primary-foreground">
            {tenant.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-base font-semibold text-primary">
            {tenant.name}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <FirmSwitcher />
          <LocaleSwitcher />
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-app text-muted hover:text-foreground"
            title={t("logout")}
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <AppNav items={nav} />

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-18 md:pl-60 md:pb-8 print:max-w-none print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
