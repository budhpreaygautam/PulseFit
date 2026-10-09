import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client.js';

interface ApiData<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  /** Load again; resolves once the new answer (or error) is on screen. */
  reload: () => Promise<void>;
}

/** Load something from the API once (and again on reload), with loading and error state. */
export function useApiData<T>(load: () => Promise<T>, deps: DependencyList = []): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  // Callers of reload() waiting for the next load to finish.
  const waiting = useRef<(() => void)[]>([]);

  // New inputs (another week, another filter) must not show the previous answer while loading;
  // a plain reload keeps it on screen.
  useEffect(() => {
    setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancelled = false;
    const answers = waiting.current.splice(0);
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
        if (cancelled) return;
        setIsLoading(false);
        // Emptied as they are answered, so a later cleanup has nobody to hand on.
        answers.splice(0).forEach(done => done());
      });
    return () => {
      cancelled = true;
      // A newer load replaces this one: whoever waited on it waits for that one instead.
      waiting.current.unshift(...answers);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  // Nothing will load after unmount; let anyone still waiting carry on.
  useEffect(() => () => waiting.current.splice(0).forEach(done => done()), []);

  const reload = useCallback(
    () =>
      new Promise<void>(resolve => {
        waiting.current.push(resolve);
        setAttempt(n => n + 1);
      }),
    []
  );
  return { data, error, isLoading, reload };
}
