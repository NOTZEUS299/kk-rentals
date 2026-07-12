import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { Input, Label, Select } from "./ui";
import { Icon } from "./icons";

export interface SortOption {
  value: string;
  label: string;
}

/**
 * List toolbar bound to URL search params: debounced ?q= search plus a
 * collapsible panel with ?from= / ?to= date range and ?sort= select.
 * Shareable URLs, replace-only history like SearchInput.
 */
export function FilterBar({
  placeholder,
  sortOptions,
  showDates = true,
}: {
  placeholder: string;
  sortOptions?: SortOption[];
  showDates?: boolean;
}) {
  const t = useTranslations("common");
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [open, setOpen] = useState(
    Boolean(searchParams.get("from") || searchParams.get("to")),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const setParam = (key: string, next: string) => {
    setSearchParams(
      (params) => {
        if (next) params.set(key, next);
        else params.delete(key);
        return params;
      },
      { replace: true },
    );
  };

  const onSearch = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", next.trim()), 300);
  };

  const active = Boolean(
    searchParams.get("from") || searchParams.get("to") || searchParams.get("sort"),
  );

  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={value}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-app border transition ${
            open || active
              ? "border-primary bg-primary-soft text-primary"
              : "border-border bg-card text-muted"
          }`}
          title={t("filters")}
          aria-expanded={open}
        >
          <Icon name="filter" className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-app border border-border bg-card p-3 md:grid-cols-3">
          {showDates && (
            <>
              <div>
                <Label htmlFor="filter-from">{t("fromDate")}</Label>
                <Input
                  id="filter-from"
                  type="date"
                  value={searchParams.get("from") ?? ""}
                  onChange={(e) => setParam("from", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-to">{t("toDate")}</Label>
                <Input
                  id="filter-to"
                  type="date"
                  value={searchParams.get("to") ?? ""}
                  onChange={(e) => setParam("to", e.target.value)}
                />
              </div>
            </>
          )}
          {sortOptions && sortOptions.length > 0 && (
            <div>
              <Label htmlFor="filter-sort">{t("sortBy")}</Label>
              <Select
                id="filter-sort"
                value={searchParams.get("sort") ?? sortOptions[0].value}
                onChange={(e) => setParam("sort", e.target.value)}
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
