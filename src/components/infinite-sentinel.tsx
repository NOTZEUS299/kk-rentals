import { useEffect, useRef } from "react";
import { Skeleton } from "./ui";

/**
 * Invisible marker at the bottom of an infinite list; fires onLoadMore
 * when scrolled near (200px margin). Shows a skeleton row while the
 * next page loads.
 */
export function InfiniteSentinel({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="pt-2">
      {loading && <Skeleton className="h-16 w-full" />}
    </div>
  );
}
