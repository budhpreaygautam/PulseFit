import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { auth, freshMember, signInAs, tabBar, test, useAppMode, useSession } from './helpers';

// The app's Train tab: a quick logger (sets kept across tabs and reloads, Finish with new records),
// this week's volume, the floor clock and progress, and the full logger one tap away.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

/** Add the first exercise of the list; returns its name. */
async function addExercise(page: Page): Promise<string> {
  const select = page.getByRole('combobox', { name: 'Exercise' });
  await expect(select.locator('option').nth(1)).toBeAttached();
  const name = (await select.locator('option').nth(1).textContent())!.trim();
  await select.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add exercise' }).click();
  return name;
}

async function addSet(page: Page, exercise: string, weight: string, reps: string): Promise<void> {
  const card = page.getByRole('region', { name: exercise, exact: true });
  await card.getByLabel('Weight (kg)').fill(weight);
  await card.getByLabel('Reps').fill(reps);
  await card.getByRole('button', { name: /^Add set/ }).click();
}

async function openTrain(page: Page, request: APIRequestContext, label: string, theme?: 'light' | 'dark') {
  const m = await freshMember(request, label);
  await useAppMode(page, { theme }); await useSession(page, m.token);
  await page.goto('/log-workout');
  return m;
}

test('a member logs sets with Add set (repeat last) and Finish saves the workout', async ({ page, request }, testInfo) => {
  const m = await openTrain(page, request, `train ${testInfo.project.name}`, 'dark');
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
  const name = await addExercise(page);
  const card = page.getByRole('region', { name, exact: true });
  await addSet(page, name, '60', '8');
  await card.getByRole('button', { name: 'Add set (repeat last)' }).click();
  await expect(card.getByText('60×8')).toHaveCount(2);
  await expect(card.getByText('2 sets')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const saved = page.getByRole('button', { name: 'Saved · nice work', exact: true });   // a first workout has no earlier records
  await expect(saved).toBeVisible();
  await expect(saved).toHaveCSS('color', 'rgb(241, 245, 249)');   // --app-tx in dark, not #090c10 on --gym-700
  const workouts = (await (await request.get('/api/workouts', { headers: auth(m.token) })).json()).data;
  expect(workouts).toHaveLength(1);
  expect(workouts[0].sets).toMatchObject([{ weight_kg: 60, reps: 8 }, { weight_kg: 60, reps: 8 }]);
  await expect(page.getByRole('img', { name: 'Volume this week: 960 kg' }).locator('[data-today]')).toHaveCSS('background-color', 'rgb(132, 204, 22)');
});

test('Finish counts a beaten record as a PR, and claims none when the records could not load', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train pr ${testInfo.project.name}`);
  const name = await addExercise(page);
  await addSet(page, name, '50', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work', exact: true })).toBeVisible();
  await addExercise(page);
  await addSet(page, name, '60', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work, 1 PR', exact: true })).toBeVisible();
  let failed = false;
  await page.route('**/api/workouts/analytics', route => (failed ? route.continue() : ((failed = true), route.abort())));
  await page.reload();
  await addExercise(page);
  await addSet(page, name, '70', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work', exact: true })).toBeVisible();
});

test('logged sets survive another tab and a reload, and Finish clears them', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train draft ${testInfo.project.name}`);
  const name = await addExercise(page);
  await addSet(page, name, '40', '10');
  await tabBar(page).getByRole('link', { name: 'Home' }).click();
  await tabBar(page).getByRole('link', { name: 'Train' }).click();
  await expect(page.getByText('40×10')).toBeVisible();
  await page.reload();
  await expect(page.getByText('40×10')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: /^Saved · nice work/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText('40×10')).toHaveCount(0);
});

test('Finish is disabled without sets, and weight or reps out of range cannot be added', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train limits ${testInfo.project.name}`);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  const name = await addExercise(page);
  const card = page.getByRole('region', { name, exact: true });
  const add = card.getByRole('button', { name: 'Add set', exact: true });
  await card.getByLabel('Weight (kg)').fill('501'); await card.getByLabel('Reps').fill('8');
  await expect(add).toBeDisabled();
  await card.getByLabel('Weight (kg)').fill('60'); await card.getByLabel('Reps').fill('0');
  await expect(add).toBeDisabled();
});

test('a draft left from an earlier day is saved on that day, timed to its last set, not as a workout today', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `train old draft ${testInfo.project.name}`);
  const exercise = (await (await request.get('/api/exercises', { headers: auth(m.token) })).json()).data[0];
  const startedAt = Date.now() - 3 * 86_400_000;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(startedAt);
  const draft = { title: 'Leg day', startedAt, lastSetAt: startedAt + 40 * 60_000, exercises: [{ exercise_id: exercise.id, exercise_name: exercise.name, sets: [{ weight_kg: 60, reps: 8 }] }] };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`pulsefit_train_draft:${m.id}`, JSON.stringify(draft)]);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/log-workout');
  // The header names the day instead of counting minutes since then.
  const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  await expect(page.getByText(`Leg day · ${shortDay}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: /^Saved · nice work/ })).toBeVisible();
  const workouts = (await (await request.get('/api/workouts', { headers: auth(m.token) })).json()).data;
  expect(workouts).toMatchObject([{ title: 'Leg day', date: day, duration_minutes: 40 }]);
  const me = (await (await request.get('/api/auth/me', { headers: auth(m.token) })).json()).data;
  expect(me.streak_days ?? 0).toBe(0);   // a back-dated workout does not count for today
});

test('a draft from an earlier day takes no new sets: it is finished on its own day first', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `train old draft add ${testInfo.project.name}`);
  const exercise = (await (await request.get('/api/exercises', { headers: auth(m.token) })).json()).data[0];
  const startedAt = Date.now() - 3 * 86_400_000;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(startedAt);
  const draft = { title: '', startedAt, lastSetAt: startedAt + 40 * 60_000, exercises: [{ exercise_id: exercise.id, exercise_name: exercise.name, sets: [{ weight_kg: 60, reps: 8 }] }] };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`pulsefit_train_draft:${m.id}`, JSON.stringify(draft)]);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/log-workout');
  const card = page.getByRole('region', { name: exercise.name, exact: true });
  await card.getByRole('button', { name: 'Add set (repeat last)' }).click();
  const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  await expect(page.getByText(`Finish your ${shortDay} workout first.`).first()).toBeVisible();
  await expect(card.getByText('1 set', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: /^Saved · nice work/ })).toBeVisible();
  const workouts = (await (await request.get('/api/workouts', { headers: auth(m.token) })).json()).data;
  expect(workouts).toMatchObject([{ date: day, duration_minutes: 40 }]);
  expect(workouts[0].sets).toHaveLength(1);
});

test('removing the last set keeps focus in its card, and removing the only set moves it to the exercise picker', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train focus ${testInfo.project.name}`);
  const name = await addExercise(page);
  const card = page.getByRole('region', { name, exact: true });
  await addSet(page, name, '40', '10');
  await card.getByRole('button', { name: 'Add set (repeat last)' }).click();
  await card.getByRole('button', { name: `Remove set 2 of ${name}` }).focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'Add set (repeat last)' })).toBeFocused();
  await card.getByRole('button', { name: `Remove set 1 of ${name}` }).focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Exercise' })).toBeFocused();
});

test("the volume chart's name says the change on last week", async ({ page, request }, testInfo) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const weekAgo = new Date(`${today}T00:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  await page.route('**/api/workouts/analytics', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.volumeTimeline = [{ date: weekAgo.toISOString().slice(0, 10), volumeKg: 800, durationMinutes: 40, title: 'Push' }, { date: today, volumeKg: 1000, durationMinutes: 40, title: 'Push' }];
    await route.fulfill({ response, json: body });
  });
  await openTrain(page, request, `train change ${testInfo.project.name}`);
  await expect(page.getByRole('img', { name: 'Volume this week: 1,000 kg, up 25% on last week', exact: true })).toBeVisible();
});

test('Train opens in the handoff order: a 70 px volume chart, the logger and Finish, then the floor clock and progress', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/log-workout');
  await expect(page.getByRole('heading', { name: 'Floor time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal records' })).toBeVisible();
  const chart = page.getByRole('img', { name: /^Volume this week/ });
  await expect(chart).toBeInViewport();
  await expect(chart.locator(':scope > div').last()).toHaveCSS('height', '70px');   // bars and day letters, as in the markup
  const top = async (l: Locator) => (await l.boundingBox())!.y;
  expect(await top(chart)).toBeLessThan(await top(page.getByRole('button', { name: 'Finish workout' })));
  expect(await top(page.getByRole('button', { name: 'Finish workout' }))).toBeLessThan(await top(page.getByRole('heading', { name: 'Floor time' })));
  await page.getByRole('link', { name: 'Workout log & history' }).click();
  await expect(page).toHaveURL(/\/log-workout\?view=full$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Log a workout' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();   // not "Delete workout Back & Biceps…"
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
});
