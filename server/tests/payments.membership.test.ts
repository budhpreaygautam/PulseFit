import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, personas, resetDb, userByEmail } from './helpers.js';

// Rohan (basic) is active until 2026-10-31 when the demo data is seeded on this date.
const NOW = new Date('2026-10-07T06:30:00.000Z');
const at = (iso: string) => vi.setSystemTime(new Date(iso));

const freeze = (email: string) => api().post('/api/membership/freeze').set(authHeader(email)).send({});
const unfreeze = (email: string) => api().post('/api/membership/unfreeze').set(authHeader(email)).send({});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(NOW.toISOString());
  resetDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /membership/freeze', () => {
  it('freezes an active membership from today', async () => {
    const res = await freeze(personas.basic);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: personas.basic, membership_status: 'frozen', frozen_since: '2026-10-07', membership_expiry: '2026-10-31' });
    expect(res.body.data.password_hash).toBeUndefined();
    expect(userByEmail(personas.basic)).toMatchObject({ membership_status: 'frozen', frozen_since: '2026-10-07' });
  });

  it('uses the gym date, not the UTC date, just after midnight in India', async () => {
    at('2026-10-07T19:00:00.000Z'); // 00:30 on 8 Oct in Asia/Kolkata
    const res = await freeze(personas.basic);
    expect(res.body.data.frozen_since).toBe('2026-10-08');
  });

  it('answers 409 NOT_ACTIVE when already frozen', async () => {
    await freeze(personas.basic);
    const res = await freeze(personas.basic);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ACTIVE');
  });

  it('answers 409 NOT_ACTIVE for an expired membership', async () => {
    const res = await freeze(personas.expired);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ACTIVE');
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
  });

  it('answers 409 NOT_ACTIVE once the paid period has run out, even if stored as active', async () => {
    at('2026-11-02T06:30:00.000Z');
    const res = await freeze(personas.basic);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ACTIVE');
  });

  it('only changes the caller', async () => {
    const aarav = userByEmail(personas.member);
    await freeze(personas.basic);
    expect(userByEmail(personas.member)).toEqual(aarav);
  });

  it('requires a signed-in user', async () => {
    expect((await api().post('/api/membership/freeze')).status).toBe(401);
  });
});

describe('POST /membership/unfreeze', () => {
  it('reactivates and moves the expiry forward by the open days missed', async () => {
    at('2026-10-02T06:30:00.000Z');
    await freeze(personas.basic);
    at(NOW.toISOString());
    const res = await unfreeze(personas.basic);
    expect(res.status).toBe(200);
    // Fri 2 Oct to Wed 7 Oct: Sat 3, Mon 5, Tue 6 missed (Sunday is closed) => Sat 31 Oct + 3 open days.
    expect(res.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-11-04', frozen_since: null });
    expect(res.body.message).toBe('Welcome back! 3 gym days added to your membership, so it now runs until 4 Nov 2026.');
  });

  it('adds nothing when unfrozen the same day', async () => {
    await freeze(personas.basic);
    const res = await unfreeze(personas.basic);
    expect(res.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-10-31' });
  });

  it('keeps a member frozen past their old expiry, then gives back the unused days', async () => {
    at('2026-10-25T06:30:00.000Z');
    await freeze(personas.basic); // Sunday 25 Oct: 6 open days left, 26 .. 31 Oct
    at('2026-12-01T06:30:00.000Z');
    expect((await api().get('/api/payments/my').set(authHeader(personas.basic))).status).toBe(200);
    const res = await unfreeze(personas.basic);
    // 31 open days missed: 10-31 + 31 open days = 12-07, so 1 .. 7 Dec (6 open days) are still to use
    expect(res.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-12-07' });
  });

  it('answers 409 NOT_FROZEN for a membership that is not frozen', async () => {
    const res = await unfreeze(personas.basic);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_FROZEN');
    expect((await unfreeze(personas.expired)).body.code).toBe('NOT_FROZEN');
  });

  it('requires a signed-in user', async () => {
    expect((await api().post('/api/membership/unfreeze')).status).toBe(401);
  });
});
