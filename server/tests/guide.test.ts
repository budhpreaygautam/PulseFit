import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';
import { GUIDE } from '../src/content/guide.js';
import { SESSION_COOKIE } from '../src/middleware/auth.js';
import { api, authHeader, personas, resetDb, tokenFor } from './helpers.js';

const CLIENT_SRC = fileURLToPath(new URL('../../client/src/', import.meta.url));
const readClient = (relative: string) => fs.readFileSync(path.join(CLIENT_SRC, relative), 'utf8');

/** Every .ts/.tsx file of the client, as text. */
function clientSources(dir = CLIENT_SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return clientSources(full);
    return /\.tsx?$/.test(entry.name) ? [fs.readFileSync(full, 'utf8')] : [];
  });
}

const text = expect.any(String);

describe('GET /api/guide', () => {
  beforeEach(() => resetDb());

  it('answers 401 to a guest and to a forged token, with none of the guide', async () => {
    for (const res of [await api().get('/api/guide'), await api().get('/api/guide').set('Authorization', 'Bearer not-a-real-token')]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: text, code: 'UNAUTHORIZED' });
    }
  });

  it('sends a member the full guide: workout plans, diet charts, nutrition rules, supplements and the strength split', async () => {
    const res = await api().get('/api/guide').set(authHeader(personas.member));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Only for signed-in accounts: no shared cache may keep a copy.
    expect(res.headers['cache-control']).toBe('private, no-cache');

    const guide = res.body.data;
    expect(guide).toEqual(GUIDE);
    expect(Object.keys(guide).sort()).toEqual(['diet_charts', 'nutrition_rules', 'strength_split', 'supplements', 'workout_plans']);

    expect(guide.workout_plans.length).toBeGreaterThan(0);
    for (const plan of guide.workout_plans) {
      expect(plan).toEqual({ id: text, name: text, level: text, goal: text, frequency: text, description: text, days: expect.any(Array) });
      expect(plan.days.length).toBeGreaterThan(0);
      for (const day of plan.days) {
        expect(day).toEqual({ name: text, exercises: expect.any(Array) });
        expect(day.exercises.length).toBeGreaterThan(0);
        for (const exercise of day.exercises) expect(exercise).toEqual({ name: text, sets: text, reps: text, rest: text, tip: text });
      }
    }

    expect(guide.diet_charts.length).toBeGreaterThan(0);
    for (const diet of guide.diet_charts) {
      const grams = expect.any(Number);
      expect(diet).toEqual({ id: text, title: text, type: text, macros: { protein_g: grams, carbs_g: grams, fats_g: grams }, description: text, meals: expect.any(Array) });
      expect(diet.meals.length).toBeGreaterThan(0);
      for (const meal of diet.meals) {
        expect(meal).toEqual({ timing: text, name: text, items: expect.any(Array), calories: expect.any(Number) });
        expect(meal.items.length).toBeGreaterThan(0);
        expect(Number.isInteger(meal.calories) && meal.calories > 0).toBe(true);
      }
    }
    for (const rule of guide.nutrition_rules) expect(rule).toEqual({ emoji: text, title: text, text });

    expect(guide.supplements.length).toBeGreaterThan(0);
    for (const supplement of guide.supplements) {
      expect(supplement).toEqual({ name: text, badge: text, stars: expect.any(Number), verdict: text, dosage: text, timing: text, why: text, faqs: expect.any(Array) });
      expect(Number.isInteger(supplement.stars) && supplement.stars >= 1 && supplement.stars <= 5).toBe(true);
      expect(supplement.faqs.length).toBeGreaterThan(0);
      for (const faq of supplement.faqs) expect(faq).toEqual({ question: text, answer: text });
    }

    expect(guide.strength_split).toHaveLength(4);
    for (const day of guide.strength_split) {
      expect(day).toEqual({ day: text, title: text, exercises: expect.any(Array) });
      expect(day.exercises.length).toBeGreaterThan(0);
    }
  });

  it('is open to every signed-in account, whatever its role or membership', async () => {
    for (const email of [personas.trainer, personas.admin, personas.vip, personas.basic, personas.expired]) {
      const res = await api().get('/api/guide').set(authHeader(email));
      expect(res.status, email).toBe(200);
      expect(res.body.data, email).toEqual(GUIDE);
    }
  });

  it("accepts the website's session cookie", async () => {
    const res = await api().get('/api/guide').set('Cookie', `${SESSION_COOKIE}=${tokenFor(personas.member)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workout_plans).toEqual(GUIDE.workout_plans);
  });
});

describe('the guide and the client', () => {
  it('keeps the full content out of the client source, so guests cannot read it from the bundle', () => {
    const sources = clientSources();
    expect(sources.length).toBeGreaterThan(20);
    const content = [
      ...GUIDE.workout_plans.flatMap(p => p.days.flatMap(d => d.exercises.map(e => e.tip))),
      ...GUIDE.diet_charts.flatMap(d => d.meals.flatMap(m => [m.name, ...m.items])),
      ...GUIDE.nutrition_rules.map(r => r.text),
      ...GUIDE.supplements.flatMap(s => [s.dosage, s.why, ...s.faqs.map(f => f.answer)]),
      ...GUIDE.strength_split.flatMap(d => d.exercises)
    ];
    for (const line of content) expect(sources.some(source => source.includes(line)), line).toBe(false);
  });

  it('names the same plans and split days as the guest teasers in the client', () => {
    const guidePage = readClient('pages/public/FitnessGuidePage.tsx');
    for (const name of [...GUIDE.workout_plans.map(p => p.name), ...GUIDE.diet_charts.map(d => d.title)]) {
      expect(guidePage, name).toContain(`name: '${name}'`);
    }
    const workoutPage = readClient('pages/public/WorkoutPage.tsx');
    for (const { day, title } of GUIDE.strength_split) expect(workoutPage, title).toContain(`{ day: '${day}', title: '${title}' }`);
  });
});
