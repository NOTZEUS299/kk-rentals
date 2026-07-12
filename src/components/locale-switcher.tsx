import { LOCALES, useLocale, useSetLocale, type AppLocale } from "@/i18n";

const LABELS: Record<AppLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const setLocale = useSetLocale();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as AppLocale)}
      className="min-h-9 rounded-app border border-border bg-card px-2 text-sm"
      aria-label="Language"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}
