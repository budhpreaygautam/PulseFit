import config from '../config.js';

// Server-to-server calls to a YouPI PG Payment API (https://github.com/youpi-pg/YouPI-PG).
// YouPI confirms a payment by reading the bank's credit alert for the gym's own account, so a
// session stays open for about five minutes and one customer pays on the UPI id at a time.

export interface YoupiSession {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  /** INITIATED / PENDING / … while open; SUCCESS, FAILED, EXPIRED or CANCELLED once settled. */
  status: string;
  checkoutUrl?: string;
  /** The 12-digit UPI reference, when YouPI reports it. */
  utr?: string;
}

export interface YoupiCreateParams {
  orderId: string;
  amountPaise: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}

/** The part of the YouPI API PulseFit uses, so tests can substitute a fake. */
export interface YoupiClient {
  createPayment(params: YoupiCreateParams): Promise<YoupiSession>;
  getPayment(paymentId: string): Promise<YoupiSession>;
}

/** Final outcomes that end a session without money arriving. */
export const YOUPI_CLOSED = ['FAILED', 'EXPIRED', 'CANCELLED'];

const TIMEOUT_MS = 10_000;

export class YoupiError extends Error {}

/** "499.00" for 49900 paise: YouPI takes amounts as rupee strings. */
export const rupeesString = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

/** YouPI answers either with the object itself or wrapped in { data }. */
function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const data = (body as { data?: unknown }).data;
  return (data && typeof data === 'object' ? data : body) as Record<string, unknown>;
}

const UTR_PATTERN = /^[0-9A-Za-z]{6,40}$/;

/** Reads a session from a YouPI response or webhook body, or null when a required field is missing. */
export function readSession(raw: unknown): YoupiSession | null {
  const body = unwrap(raw);
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
  const paymentId = text('paymentId');
  const orderId = text('orderId');
  const amountPaise = Number(body.amountPaise);
  // Status lookups say `status`; webhooks say `event`.
  const status = (text('status') || text('event')).toUpperCase();
  if (!paymentId || !orderId || !Number.isInteger(amountPaise) || !status) return null;
  const utr = text('utr');
  return {
    paymentId,
    orderId,
    amountPaise,
    currency: (text('currency') || 'INR').toUpperCase(),
    status,
    ...(text('checkoutUrl') ? { checkoutUrl: text('checkoutUrl') } : {}),
    ...(UTR_PATTERN.test(utr) ? { utr } : {})
  };
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${config.youpi.apiUrl}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new YoupiError(`YouPI is unreachable: ${(err as Error).message}`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
    throw new YoupiError(`YouPI answered ${res.status}${typeof reason === 'string' ? `: ${reason.slice(0, 200)}` : ''}`);
  }
  return body;
}

const httpClient: YoupiClient = {
  async createPayment(params) {
    const body = await call('/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': config.youpi.merchantId,
        // Our order id is unique per checkout, so a retried request cannot open a second session.
        'Idempotency-Key': params.orderId
      },
      body: JSON.stringify({
        orderId: params.orderId,
        amount: rupeesString(params.amountPaise),
        currency: 'INR',
        description: params.description,
        returnUrl: params.returnUrl,
        // No name, email or phone: the gateway only needs the order and the amount.
        metadata: params.metadata
      })
    });
    const session = readSession(body);
    if (!session?.checkoutUrl) throw new YoupiError('YouPI did not return a payment session with a checkout URL.');
    return session;
  },

  async getPayment(paymentId) {
    // The merchant's webhook secret is what YouPI accepts as proof that we own this payment.
    const body = await call(`/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'X-Merchant-Key': config.youpi.webhookSecret }
    });
    const session = readSession(body);
    if (!session) throw new YoupiError('YouPI returned an unreadable payment status.');
    return session;
  }
};

let testClient: YoupiClient | null = null;

/** Replace the YouPI client in tests; pass null to go back to HTTP calls. */
export function setYoupiClientForTests(client: YoupiClient | null): void {
  testClient = client;
}

export const youpi = (): YoupiClient => testClient ?? httpClient;

/** A checkout page address from YouPI is only followed if it is a web page (HTTPS in production). */
export function isSafeCheckoutUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || (protocol === 'http:' && !config.isProduction);
  } catch {
    return false;
  }
}
