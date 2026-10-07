import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import config from '../src/config.js';
import { GoogleProfile, InvalidGoogleTokenError, setGoogleVerifierForTests, verifyGoogleIdToken } from '../src/lib/google.js';
import { api, db, personas, resetDb, userByEmail } from './helpers.js';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';

// Fake verifier: the "credential" is the JSON of the profile it stands for, or 'bad'.
function fakeVerifier(credential: string, audience: string): Promise<GoogleProfile> {
  if (credential === 'bad' || audience !== CLIENT_ID) return Promise.reject(new InvalidGoogleTokenError('bad token'));
  return Promise.resolve(JSON.parse(credential));
}

const cred = (p: GoogleProfile) => JSON.stringify(p);

describe('POST /auth/google', () => {
  const originalClientId = config.googleClientId;

  beforeEach(() => {
    resetDb();
    config.googleClientId = CLIENT_ID;
    setGoogleVerifierForTests(fakeVerifier);
  });
  afterEach(() => {
    config.googleClientId = originalClientId;
    setGoogleVerifierForTests(null);
  });

  it('answers 503 GOOGLE_SIGNIN_DISABLED when no client id is configured', async () => {
    config.googleClientId = '';
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: '1', email: 'a@gmail.com' }) });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });

  it('answers 401 INVALID_GOOGLE_TOKEN for a credential that does not verify', async () => {
    const res = await api().post('/api/auth/google').send({ credential: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_GOOGLE_TOKEN');
    expect(res.body.data).toBeUndefined();
  });

  it('answers 400 when the credential is missing', async () => {
    const res = await api().post('/api/auth/google').send({ email: personas.admin });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('creates a pending member with no plan for a new Google user', async () => {
    const res = await api()
      .post('/api/auth/google')
      .send({ credential: cred({ sub: 'g-123', email: 'new.person@gmail.com', name: 'New Person', picture: 'https://lh3/x.png' }), tier: 'vip' });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).toMatchObject({
      email: 'new.person@gmail.com',
      name: 'New Person',
      role: 'member',
      phone: '',
      membership_tier: 'none',
      membership_status: 'pending',
      membership_expiry: null
    });
    expect(res.body.data.user.google_sub).toBeUndefined();
    const stored = userByEmail('new.person@gmail.com');
    expect(stored.google_sub).toBe('g-123');
    expect(stored.password_hash).toBeUndefined();
    expect(stored.id).toMatch(/^usr_[0-9a-f]{12}$/);
  });

  it('regression: two new Google users never share an id or account', async () => {
    const a = await api().post('/api/auth/google').send({ credential: cred({ sub: 'goog_1790000001', email: 'one@gmail.com' }) });
    const b = await api().post('/api/auth/google').send({ credential: cred({ sub: 'goog_1790000002', email: 'two@gmail.com' }) });
    expect(a.body.data.user.id).not.toBe(b.body.data.user.id);
    expect(b.body.data.user.email).toBe('two@gmail.com');
    expect(a.body.data.user.qr_code_token).not.toBe(b.body.data.user.qr_code_token);
  });

  it('signs a returning Google user into the same account by subject id, even if the email changed', async () => {
    const first = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-9', email: 'old@gmail.com', name: 'Kiran' }) });
    const again = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-9', email: 'renamed@gmail.com', name: 'Someone Else' }) });
    expect(again.status).toBe(200);
    expect(again.body.data.created).toBe(false);
    expect(again.body.data.user.id).toBe(first.body.data.user.id);
    expect(again.body.data.user.name).toBe('Kiran');
  });

  it('links an existing account by verified email without overwriting its name or photo', async () => {
    const before = userByEmail(personas.member);
    const res = await api()
      .post('/api/auth/google')
      .send({ credential: cred({ sub: 'g-aarav', email: personas.member, name: 'Hijacked', picture: 'https://evil/x.png' }) });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(false);
    expect(res.body.data.user).toMatchObject({ id: before.id, name: before.name, avatar_url: before.avatar_url, membership_tier: 'pro' });
    expect(userByEmail(personas.member).google_sub).toBe('g-aarav');
    expect(userByEmail(personas.member).password_hash).toBe(before.password_hash);
  });

  it('refuses an email already linked to a different Google account', async () => {
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: 'someone-else', email: 'isha.nair@example.com' }) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GOOGLE_ACCOUNT_CONFLICT');
    expect(db.users.filter(u => u.email === 'isha.nair@example.com')).toHaveLength(1);
  });

  it('passes the configured client id as the audience', async () => {
    config.googleClientId = 'other-client';
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: '1', email: 'a@gmail.com' }) });
    expect(res.status).toBe(401);
  });
});

describe('verifyGoogleIdToken (real jose verification against a local key set)', () => {
  let privateKey: CryptoKey;
  let keys: JWTVerifyGetKey;
  let otherKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
    keys = createLocalJWKSet({ keys: [jwk] });
  });
  afterAll(() => setGoogleVerifierForTests(null));

  async function sign(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string | number; key?: CryptoKey } = {}) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(opts.key ?? privateKey);
  }

  const good = { sub: '1001', email: 'Real.Person@Gmail.com', email_verified: true, name: 'Real Person' };

  it('accepts a valid token from either Google issuer and lowercases the email', async () => {
    for (const iss of ['https://accounts.google.com', 'accounts.google.com']) {
      const profile = await verifyGoogleIdToken(await sign(good, { iss }), CLIENT_ID, keys);
      expect(profile).toMatchObject({ sub: '1001', email: 'real.person@gmail.com', name: 'Real Person' });
    }
  });

  it.each([
    ['wrong audience', { aud: 'someone-elses-app' }, good],
    ['wrong issuer', { iss: 'https://evil.example.com' }, good],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 60 }, good],
    ['unverified email', {}, { ...good, email_verified: false }],
    ['missing email', {}, { sub: '1', email_verified: true }]
  ])('rejects a token with %s', async (_label, opts, claims) => {
    const token = await sign(claims as Record<string, unknown>, opts as any);
    await expect(verifyGoogleIdToken(token, CLIENT_ID, keys)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects a token signed by another key and garbage input', async () => {
    await expect(verifyGoogleIdToken(await sign(good, { key: otherKey }), CLIENT_ID, keys)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    await expect(verifyGoogleIdToken('not-a-jwt', CLIENT_ID, keys)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });
});
