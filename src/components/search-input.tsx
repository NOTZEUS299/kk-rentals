import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * List search box bound to the ?q= search param. Debounced replace so
 * the list re-filters without polluting history.
 */
export function SearchInput({ placeholder }: { placeholder: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearchParams(
        (params) => {
          if (next.trim()) params.set("q", next.trim());
          else params.delete("q");
          return params;
        },
        { replace: true },
      );
    }, 300);
  };

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mb-3 min-h-11 w-full rounded-app border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
}
