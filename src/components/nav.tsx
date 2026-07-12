import { Link, useLocation } from "react-router-dom";
import { useTranslations } from "@/i18n";
import type { NavItem } from "@/lib/modules/registry";
import { Icon } from "./icons";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Bottom tab bar on mobile, left sidebar on md+ screens. */
export function AppNav({ items }: { items: NavItem[] }) {
  const t = useTranslations("nav");
  const { pathname } = useLocation();

  return (
    <>
      {/* mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {items.slice(0, 6).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <Icon
                name={item.icon}
                className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`}
              />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* desktop sidebar */}
      <nav className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col gap-1 border-r border-border bg-card p-3 pt-16 md:flex print:hidden">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`relative flex items-center gap-3 rounded-app px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-primary-soft text-primary"
                  : "text-foreground hover:translate-x-0.5 hover:bg-background"
              }`}
            >
              {active && (
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
              )}
              <Icon name={item.icon} className="h-5 w-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
