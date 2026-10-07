import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client.js';

interface ApiData<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
}

/** Load something from the API once (and again on reload), with loading and error state. */
export function useApiData<T>(load: () => Promise<T>, deps: DependencyList = []): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  // New inputs (another week, another filter) must not show the previous answer while loading;
  // a plain reload keeps it on screen.
  useEffect(() => {
    setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadRef
      .current()
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const reload = useCallback(() => setAttempt(n => n + 1), []);
  return { data, error, isLoading, reload };
}
