import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import en from "./messages/en.json";
import hi from "./messages/hi.json";
import gu from "./messages/gu.json";

export const LOCALES = ["en", "hi", "gu"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

const MESSAGES: Record<AppLocale, Record<string, unknown>> = { en, hi, gu };

const STORAGE_KEY = "rentbook.locale";

export function isAppLocale(v: unknown): v is AppLocale {
  return (LOCALES as readonly string[]).includes(String(v));
}

function storedLocale(): AppLocale {
  const v = localStorage.getItem(STORAGE_KEY);
  return isAppLocale(v) ? v : DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  adoptLocale: (l: unknown) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(storedLocale);
  // whether the user has explicitly picked a language on this device —
  // only then does their choice beat the tenant's configured locale
  const explicit = useRef(isAppLocale(localStorage.getItem(STORAGE_KEY)));

  const setLocale = useCallback((l: AppLocale) => {
    localStorage.setItem(STORAGE_KEY, l);
    explicit.current = true;
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  /** Tenant/profile default (from onboarding) — no-op after an explicit pick. */
  const adoptLocale = useCallback((l: unknown) => {
    if (explicit.current || !isAppLocale(l)) return;
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, adoptLocale }),
    [locale, setLocale, adoptLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): AppLocale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale outside I18nProvider");
  return ctx.locale;
}

export function useSetLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useSetLocale outside I18nProvider");
  return ctx.setLocale;
}

export function useAdoptLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useAdoptLocale outside I18nProvider");
  return ctx.adoptLocale;
}

function resolve(messages: Record<string, unknown>, path: string): unknown {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * next-intl style translator: `const t = useTranslations("challans")`
 * then `t("title")` / `t("sources.own")`. Falls back to English, then
 * to the key itself, so a missing translation never crashes a page.
 */
export function useTranslations(namespace?: string) {
  const locale = useLocale();
  return useCallback(
    (key: string): string => {
      const path = namespace ? `${namespace}.${key}` : key;
      const hit = resolve(MESSAGES[locale], path) ?? resolve(MESSAGES.en, path);
      return typeof hit === "string" ? hit : key;
    },
    [locale, namespace],
  );
}
