import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { DatabaseSchema } from '../src/db/database.js';
import { defaultGymContact } from '../src/lib/gymContact.js';
import { setMailSenderForTests, type Mail } from '../src/lib/mailer.js';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

// The gym contact setting: phone, WhatsApp, email and social links (GET/PUT /gym/contact), served
// with GET /config.

// A function: the token is made after beforeEach has seeded the accounts.
const admin = () => authHeader(personas.admin);
const valid = {
  phone: '098110 12345',
  whatsapp: '+91 98110 55555',
  email: ' Desk@PulseFit.example ',
  instagram: 'https://www.instagram.com/pulsefit.gurugram',
  facebook: 'https://fb.com/pulsefit',
  youtube: 'https://youtu.be/abc123',
  x: 'https://twitter.com/pulsefit'
};
const save = (body: object, who = admin()) => api().put('/api/gym/contact').set(who).send(body);
const issuePaths = (res: { body: { data?: { issues?: { path: string }[] } } }) => res.body.data?.issues?.map(i => i.path);

beforeEach(() => resetDb());

describe('GET/PUT /gym/contact', () => {
  it("starts with the details the website showed before, and no social links", async () => {
    const res = await api().get('/api/gym/contact').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ phone: '+919811078573', whatsapp: '', email: 'contact@pulsefit.in', instagram: '', facebook: '', youtube: '', x: '' });
  });

  it('saves the details with the phones in one form and the email in lower case', async () => {
    const res = await save(valid);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const expected = { ...valid, phone: '+919811012345', whatsapp: '+919811055555', email: 'desk@pulsefit.example' };
    expect(res.body).toMatchObject({ data: expected, message: 'Gym contact details saved.' });
    expect(db.gym_contact).toEqual(expected);
  });

  it.each([
    ['9811012345', '+919811012345'],
    ['+91-98110-12345', '+919811012345'],
    ['91 98110 12345', '+919811012345'],
    ['0124 456 7890', '+911244567890'],
    ['(011) 2345 6789', '+911123456789']
  ])('takes the Indian number %s as %s', async (phone, stored) => {
    const res = await save({ ...valid, phone, whatsapp: phone });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ phone: stored, whatsapp: stored });
  });

  it('leaves WhatsApp and every link empty when they are left out or blank', async () => {
    const res = await save({ phone: '9811012345', email: 'desk@pulsefit.example', instagram: '  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ phone: '+919811012345', whatsapp: '', email: 'desk@pulsefit.example', instagram: '', facebook: '', youtube: '', x: '' });
  });

  it.each([
    ['phone', ''],
    ['phone', '12345'],
    ['phone', '+1 415 555 0100'],
    ['phone', '0098110 12345'],
    ['phone', '98110 1234a'],
    ['whatsapp', '98110 1234'],
    ['email', 'not-an-email'],
    ['instagram', 'http://instagram.com/pulsefit'],
    ['instagram', 'javascript:alert(1)//instagram.com/x'],
    ['instagram', 'data:text/html,instagram.com'],
    ['instagram', 'https://instagram.com.evil.example/pulsefit'],
    ['instagram', 'https://evilinstagram.com/pulsefit'],
    ['instagram', 'https://facebook.com/pulsefit'],
    ['instagram', 'https://instagram.com/'],
    ['instagram', 'https://user@instagram.com/pulsefit'],
    ['instagram', 'instagram.com/pulsefit'],
    ['facebook', 'https://m.facebook.com.example/pulsefit'],
    ['youtube', 'https://vimeo.com/pulsefit'],
    ['x', 'https://x.co/pulsefit']
  ])('refuses %s %j and stores nothing', async (field, value) => {
    const res = await save({ ...valid, [field]: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(issuePaths(res)).toEqual([field]);
    expect(db.gym_contact).toEqual(defaultGymContact());
  });

  it('refuses unknown fields', async () => {
    const res = await save({ ...valid, address: 'Somewhere else' });
    expect(res.status).toBe(400);
    expect(db.gym_contact).toEqual(defaultGymContact());
  });

  it('is for admins only', async () => {
    for (const who of [personas.member, personas.trainer]) {
      expect((await api().get('/api/gym/contact').set(authHeader(who))).status, who).toBe(403);
      expect((await save(valid, authHeader(who))).status, who).toBe(403);
    }
    expect((await api().get('/api/gym/contact')).status).toBe(401);
    expect((await api().put('/api/gym/contact').send(valid)).status).toBe(401);
    expect(db.gym_contact).toEqual(defaultGymContact());
  });
});

describe('GET /config', () => {
  it("serves the contact details and the site's public address to everyone", async () => {
    const before = (await api().get('/api/config')).body.data.gym;
    expect(before.contact).toEqual(defaultGymContact());
    expect(before.website).toBe(config.publicUrl || config.corsOrigins[0]);

    await save(valid);
    const after = (await api().get('/api/config')).body.data.gym;
    expect(after.contact).toMatchObject({ phone: '+919811012345', whatsapp: '+919811055555', instagram: valid.instagram });
  });
});

describe('a database from before the setting', () => {
  it('gets the default contact details', () => {
    const { gym_contact: _none, ...legacy } = db.snapshot();
    db.restore(legacy as DatabaseSchema);
    expect(db.gym_contact).toEqual(defaultGymContact());
  });
});

describe('enquiry confirmation email', () => {
  afterEach(() => {
    setMailSenderForTests(null);
    Object.assign(config.mail, { brevoApiKey: '', from: '', inbox: '' });
  });

  it("signs off with the gym's current phone number", async () => {
    const sent: Mail[] = [];
    setMailSenderForTests(async mail => {
      sent.push(mail);
    });
    Object.assign(config.mail, { brevoApiKey: 'test-key', from: 'desk@example.com', inbox: 'desk@example.com' });
    await save({ ...valid, phone: '0124 456 7890' });
    const res = await api()
      .post('/api/enquiries')
      .send({ name: 'Sara Ali', email: 'sara@example.com', phone: '+91 99999 12345', interest: 'Zumba & Cardio', contact_time: 'Evening', consent: true });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const confirmation = sent.find(m => m.to === 'sara@example.com')!;
    expect(confirmation.text).toContain('+911244567890');
    expect(confirmation.text).not.toContain('+919811078573');
  });
});
