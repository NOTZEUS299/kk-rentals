/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect --
 * same SWR-style conventions as use-query.ts: latest fn rides in a ref,
 * loading flips inside the fetch effect. */
import { useCallback, useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 50;

export interface PagedQueryState<T> {
  rows: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  /** fetch the next page (no-op while loading or when exhausted) */
  loadMore: () => void;
  /** reset to page 0 and refetch (after a mutation) */
  reload: () => void;
}

/**
 * Paged variant of useQuery for infinite-scroll lists. `fetchPage(page)`
 * returns one page of PAGE_SIZE rows; a short page means the end.
 * Resets whenever `deps` change; ignores out-of-order resolutions.
 */
export function usePagedQuery<T>(
  fetchPage: (page: number) => Promise<T[]>,
  deps: readonly unknown[],
): PagedQueryState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const page = useRef(0);
  const busy = useRef(false);

  const fnRef = useRef(fetchPage);
  fnRef.current = fetchPage;

  useEffect(() => {
    const mySeq = ++seq.current;
    page.current = 0;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    fnRef
      .current(0)
      .then((result) => {
        if (seq.current !== mySeq) return;
        setRows(result);
        setHasMore(result.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (seq.current !== mySeq) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const loadMore = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const mySeq = seq.current;
    const nextPage = page.current + 1;
    setLoadingMore(true);
    fnRef
      .current(nextPage)
      .then((result) => {
        busy.current = false;
        if (seq.current !== mySeq) return;
        page.current = nextPage;
        setRows((cur) => [...cur, ...result]);
        setHasMore(result.length === PAGE_SIZE);
        setLoadingMore(false);
      })
      .catch((e: unknown) => {
        busy.current = false;
        if (seq.current !== mySeq) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoadingMore(false);
      });
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, loading, loadingMore, hasMore, error, loadMore, reload };
}
