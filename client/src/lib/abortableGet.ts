import { ApiError } from '../api/client.js';
import { storage, TOKEN_KEY } from './storage.js';

const NO_ANSWER = 'Cannot reach the PulseFit server. Check your connection and try again.';

/**
 * A GET to the API that can be called off. The start-up checks (the deployment's settings and the
 * saved session) use this rather than api/client.ts, whose calls cannot be aborted: a check that
 * hangs is called off instead of left open, so retries against a server that has stopped answering
 * do not pile up (the browser opens only a handful of connections per site, and the page's own
 * requests would queue behind them).
 *
 * Failures are ApiErrors, as from api/client.ts: status 0 when no answer came (aborted included).
 * A 401 is not announced to the app; the caller decides what it means.
 */
export async function abortableGet<T>(endpoint: string, signal: AbortSignal): Promise<T> {
  const token = storage.get(TOKEN_KEY);
  let status: number;
  let body: { success?: boolean; data?: T; error?: string; code?: string } | null = null;
  try {
    const response = await fetch(`/api${endpoint}`, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    status = response.status;
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (response.ok && body && body.success !== false) return body.data as T;
  } catch {
    throw new ApiError(NO_ANSWER, 0, 'NETWORK_ERROR');
  }
  throw new ApiError(body?.error || `The server returned an error (${status}). Please try again.`, status, body?.code);
}
