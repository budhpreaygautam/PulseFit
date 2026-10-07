import { beforeEach, describe, expect, it } from 'vitest';
import { api, authHeader, personas, resetDb } from './helpers.js';

describe('API smoke', () => {
  beforeEach(() => resetDb());

  it('reports health', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('describes the deployment in /config without leaking secrets', async () => {
    const res = await api().get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ demoMode: true, gym: { timezone: 'Asia/Kolkata', currency: 'INR' } });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });

  it('signs in a seeded member with email and password', async () => {
    const res = await api().post('/api/auth/login').send({ email: personas.member, password: 'pulse123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(personas.member);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('lists the plan catalogue with entitlements', async () => {
    const res = await api().get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.tier).sort()).toEqual(['basic', 'pro', 'vip']);
    expect(res.body.data.every((p: any) => Array.isArray(p.categories))).toBe(true);
  });

  it('lists the weekly timetable', async () => {
    const res = await api().get('/api/classes');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns 401 for a protected route without a token and 403 for the wrong role', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/members').set(authHeader(personas.member))).status).toBe(403);
    expect((await api().get('/api/members').set(authHeader(personas.admin))).status).toBe(200);
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
