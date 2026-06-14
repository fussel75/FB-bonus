/**
 * useFetch — generischer Datenlader mit Loading/Error/Refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface FetchState<T> {
  data:     T | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps:    unknown[] = [],
): FetchState<T> {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  // Stabiler Ref für den Fetcher (verhindert endlose Re-Render)
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcherRef.current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Fehler beim Laden';
          setError(msg);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refresh };
}
