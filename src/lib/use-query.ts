/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect --
 * standard SWR-style fetch hook: the latest fn rides in a ref so deps
 * stay caller-controlled, and loading flips inside the fetch effect. */
import { useCallback, useEffect, useRef, useState } from "react";

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  /** re-run the fetch (after a mutation) */
  reload: () => void;
}

/**
 * Minimal fetch hook: runs `fn` on mount and whenever `deps` change,
 * ignores out-of-order resolutions. Replaces the old Next server
 * components' per-request fetch.
 */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const mySeq = ++seq.current;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((result) => {
        if (seq.current !== mySeq) return;
        setData(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (seq.current !== mySeq) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
