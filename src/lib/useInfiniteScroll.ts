import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Progressive reveal for a client-side list: renders `pageSize` items at a
 * time, appending more as a sentinel element scrolls into view. The full
 * `items` array is expected to already be in memory (fine for a local
 * IndexedDB dataset). This only controls how much of it gets rendered.
 *
 * Pass `resetKey` (e.g. the selected vehicle id) so the visible count is
 * dropped back to `pageSize` when the underlying list represents a
 * different thing, rather than on every incidental re-render.
 */
export function useInfiniteScroll<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const itemsLengthRef = useRef(items.length);
  itemsLengthRef.current = items.length;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setCount((c) => Math.min(c + pageSize, itemsLengthRef.current));
          }
        },
        { rootMargin: '300px' },
      );
      observerRef.current.observe(node);
    },
    [pageSize],
  );

  const visibleCount = Math.min(count, items.length);
  return {
    visibleItems: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
    loadMore: () => setCount((c) => Math.min(c + pageSize, itemsLengthRef.current)),
  };
}
