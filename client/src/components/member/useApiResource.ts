import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client.js';

export interface ApiResource<T> {
  data: T | null;
  error: string | null;
  /** True while a request is in flight (also during a background refresh). */
  isLoading: boolean;
  reload: () => Promise<void>;
}

/**
 * Load one API resource with loading / error state. reload() keeps the previous data on screen
 * while it runs, and only the newest request may write its result.
 */
export function useApiResource<T>(load: () => Promise<T>, deps: DependencyList = []): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadRef.current();
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  // New deps mean a different resource: drop the old data rather than show it under the new key.
  useEffect(() => {
    setData(null);
    reload();
    return () => {
      // Invalidate whatever is in flight so it cannot set state after unmount or a deps change.
      requestId.current++;
    };
  }, deps);

  return { data, error, isLoading, reload };
}
