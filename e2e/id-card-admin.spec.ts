import { test, expect, APIRequestContext, Page, TestInfo } from '@playwright/test';
import { signInAs, useSession } from './helpers';

// The physical ID cards the front desk hands out: the ID cards page, issuing, deactivating and
// reactivating a card, the scanner refusing a deactivated one, and a card's history in the member's
// details. Desktop and mobile share one database, so every test creates the members it needs (named
// after the project and the run) and removes them again; their cards go with them.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Created {
  id: string;
  name: string;
  email: string;
  password: string;
  pass: string;
}

interface Card {
  id: string;
  card_number: string;
  status: 'active' | 'deactivated';
  replaces_card_id: string | null;
  events: { type: string; note?: string }[];
}

/** A name no other test, project or run uses, so a search finds only this test's people. */
const unique = (label: string, testInfo: TestInfo) => `${label} ${testInfo.project.name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An admin token for setting things up, without signing the page in as the admin. */
async function adminApiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/demo-login', { data: { role: 'admin' } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.token as string;
}

async function createMember(request: APIRequestContext, admin: string, name: string): Promise<Created> {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`;
  const res = await request.post('/api/members', { headers: auth(admin), data: { name, email, membership_tier: 'basic', expiry_months: 1 } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { member, tempPassword } = (await res.json()).data;
  return { id: member.id, name, email, password: tempPassword, pass: member.qr_code_token };
}

async function removeMembers(request: APIRequestContext, admin: string, members: Created[]) {
  for (const m of members) await request.delete(`/api/members/${m.id}`, { headers: auth(admin) });
}

async function issueCard(request: APIRequestContext, admin: string, memberId: string, note?: string): Promise<Card> {
  const res = await request.post(`/api/members/${memberId}/id-cards`, { headers: auth(admin), data: note ? { note } : {} });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).data.card as Card;
}

async function deactivateCard(request: APIRequestContext, admin: string, cardId: string, reason: string) {
  const res = await request.post(`/api/id-cards/${cardId}/deactivate`, { headers: auth(admin), data: { reason } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function memberDetail(request: APIRequestContext, admin: string, memberId: string) {
  const res = await request.get(`/api/members/${memberId}`, { headers: auth(admin) });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).data as { attendance_count: number; id_cards: Card[] };
}

/** Open the ID cards page and search it. */
async function openIdCards(page: Page, search: string) {
  await page.goto('/admin/id-cards');
  await searchIdCards(page, search);
}

async function searchIdCards(page: Page, search: string) {
  await page.getByRole('searchbox', { name: /^Search by name/ }).fill(search);
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
}

/**
 * A person's row on the ID cards page: a table row from the md breakpoint, a stacked card below it.
 * The other layout is hidden, and role queries skip hidden elements.
 */
function rowOf(page: Page, name: string) {
  const main = page.getByRole('main');
  return main.getByRole('row').or(main.getByRole('listitem')).filter({ hasText: name });
}

/** The card number with its status badge next to it. */
const cardWithStatus = (number: string, status: 'Active' | 'Deactivated') => new RegExp(`${number}\\s*${status}`);

async function checkInAtDesk(page: Page, code: string) {
  await page.goto('/admin/check-in');
  await page.getByLabel('Pass code, ID card number, member email or trial code').fill(code);
  await page.getByRole('button', { name: /^Check in$/ }).click();
}

const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' });

// The badge in the card dialog swings on its lanyard; with reduced motion it hangs still, so it can be clicked.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the ID cards page counts people by card status, filters by it and finds a card by its number', async ({ page, request }, testInfo) => {
  const admin = await signInAs(page, request, 'admin');
  const tag = unique('Cards', testInfo);
  const none = await createMember(request, admin, `${tag} Ada`);
  const active = await createMember(request, admin, `${tag} Ben`);
  const lost = await createMember(request, admin, `${tag} Cy`);
  const people = [none, active, lost];
  try {
    const activeCard = await issueCard(request, admin, active.id);
    const lostCard = await issueCard(request, admin, lost.id);
    await deactivateCard(request, admin, lostCard.id, 'lost');

    // The admin links lead there: the navbar's from the md breakpoint, the page's own below it.
    await page.goto('/admin/members');
    const adminLinks = page.getByRole('navigation', { name: /^(Front desk & admin|Admin sections)$/ });
    await adminLinks.getByRole('link', { name: 'ID cards' }).or(adminLinks.getByRole('button', { name: 'ID cards' })).click();
    await expect(page).toHaveURL(/\/admin\/id-cards$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ID cards' })).toBeVisible();

    await searchIdCards(page, tag);
    const chips = page.getByRole('group', { name: 'Card status' });
    const chip = (label: string) => chips.getByRole('button', { name: new RegExp(`^${label}`) });
    await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
    // Each chip says how many it would list, counted before the status filter.
    await expect(chip('All')).toHaveText(/^All\s*3$/);
    await expect(chip('Active')).toHaveText(/^Active\s*1$/);
    await expect(chip('Deactivated')).toHaveText(/^Deactivated\s*1$/);
    await expect(chip('Not issued')).toHaveText(/^Not issued\s*1$/);
    await expect(page.getByRole('main')).toContainText(/Cards issued\s*2/);

    await expect(rowOf(page, none.name)).toContainText('Not issued');
    await expect(rowOf(page, active.name)).toContainText(cardWithStatus(activeCard.card_number, 'Active'));
    await expect(rowOf(page, lost.name)).toContainText(cardWithStatus(lostCard.card_number, 'Deactivated'));
    await expect(rowOf(page, lost.name)).toContainText('Lost');

    for (const [label, shown] of [
      ['Active', active],
      ['Deactivated', lost],
      ['Not issued', none]
    ] as const) {
      await chip(label).click();
      await expect(chip(label)).toHaveAttribute('aria-pressed', 'true');
      for (const person of people) await expect(rowOf(page, person.name)).toHaveCount(person === shown ? 1 : 0);
    }
    await chip('All').click();
    for (const person of people) await expect(rowOf(page, person.name)).toHaveCount(1);

    // A card number is found however it is typed: lower case, with spaces instead of hyphens.
    await searchIdCards(page, activeCard.card_number.toLowerCase().replace(/-/g, ' '));
    await expect(page.getByText(/^1 person$/)).toBeVisible();
    await expect(rowOf(page, active.name)).toHaveCount(1);
  } finally {
    await removeMembers(request, admin, people);
  }
});

test('issuing a card from the ID cards page makes it active, and View card shows that card', async ({ page, request }, testInfo) => {
  const admin = await signInAs(page, request, 'admin');
  const member = await createMember(request, admin, unique('Card Issue', testInfo));
  try {
    await openIdCards(page, member.name);
    const row = rowOf(page, member.name);
    await expect(row).toContainText('Not issued');
    await row.getByRole('button', { name: 'Issue card' }).click();

    const dialog = page.getByRole('dialog', { name: 'Issue an ID card?' });
    await dialog.getByLabel('Note (optional)').fill('Collected at the desk');
    await dialog.getByRole('button', { name: 'Issue card' }).click();
    await expect(dialog).toHaveCount(0);

    const [card] = (await memberDetail(request, admin, member.id)).id_cards;
    expect(card).toMatchObject({ status: 'active', events: [{ type: 'issued', note: 'Collected at the desk' }] });
    await expect(toasts(page)).toContainText(`ID card ${card.card_number} issued to ${member.name}.`);
    await expect(row).toContainText(cardWithStatus(card.card_number, 'Active'));
    await expect(row.getByRole('button', { name: 'Issue card' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Deactivate' })).toBeVisible();
    // The button that opened the dialog is gone, so focus moves to the person's first action.
    await expect(row.getByRole('button', { name: 'View card' })).toBeFocused();

    await row.getByRole('button', { name: 'View card' }).click();
    const cardDialog = page.getByRole('dialog', { name: `${member.name}'s ID card` });
    await expect(cardDialog).toHaveAccessibleDescription(`Card ${card.card_number}, issued at the front desk. Its QR code works at check-in.`);
    await expect(cardDialog.getByRole('button', { name: 'Show the back of the card' })).toHaveAccessibleDescription(
      new RegExp(`, member ID PF-\\d{2}-[0-9A-Z]{6}, .* Card ${card.card_number}, active\\.$`)
    );
    await page.keyboard.press('Escape');
    await expect(cardDialog).toHaveCount(0);
  } finally {
    await removeMembers(request, admin, [member]);
  }
});

test('a card deactivated as lost is refused at the check-in desk, while the app pass still works', async ({ page, request }, testInfo) => {
  const admin = await signInAs(page, request, 'admin');
  const member = await createMember(request, admin, unique('Card Lost', testInfo));
  try {
    const card = await issueCard(request, admin, member.id);
    await openIdCards(page, member.name);
    const row = rowOf(page, member.name);
    await row.getByRole('button', { name: 'Deactivate' }).click();

    const dialog = page.getByRole('dialog', { name: `Deactivate card ${card.card_number}?` });
    await expect(dialog).toContainText('The card stops working at check-in straight away.');
    await dialog.getByLabel('Reason').selectOption({ label: 'Lost' });
    await dialog.getByLabel('Note (optional)').fill('Left on the bus');
    await dialog.getByRole('button', { name: 'Deactivate card' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(toasts(page)).toContainText(`Card ${card.card_number} is deactivated and no longer works at check-in.`);
    await expect(row).toContainText(cardWithStatus(card.card_number, 'Deactivated'));
    await expect(row).toContainText('Lost');
    await expect(row).toContainText('Left on the bus');
    await expect(row.getByRole('button', { name: 'Reactivate' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Issue new card' })).toBeVisible();

    // The desk is told whose card it is and why it stopped working, and nothing is recorded.
    await checkInAtDesk(page, card.card_number);
    await expect(page.getByText('Access denied · ID card deactivated')).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(
          `^This ID card \\(${card.card_number}\\) belongs to ${escapeRegExp(member.name)} and was deactivated on .+ \\(lost\\)\\. Ask for their app pass, or issue a new card\\.$`
        )
      )
    ).toBeVisible();
    expect((await memberDetail(request, admin, member.id)).attendance_count).toBe(0);

    // The member's app pass has its own code, so it still lets them in.
    await page.getByLabel('Pass code, ID card number, member email or trial code').fill(member.pass);
    await page.getByRole('button', { name: /^Check in$/ }).click();
    await expect(page.getByText('Access granted').first()).toBeVisible();
    expect((await memberDetail(request, admin, member.id)).attendance_count).toBe(1);
  } finally {
    await removeMembers(request, admin, [member]);
  }
});

test('a reactivated card works at the check-in desk again', async ({ page, request }, testInfo) => {
  const admin = await signInAs(page, request, 'admin');
  const member = await createMember(request, admin, unique('Card Found', testInfo));
  try {
    const card = await issueCard(request, admin, member.id);
    await deactivateCard(request, admin, card.id, 'lost');
    await openIdCards(page, member.name);
    const row = rowOf(page, member.name);
    await expect(row).toContainText(cardWithStatus(card.card_number, 'Deactivated'));
    await row.getByRole('button', { name: 'Reactivate' }).click();

    const dialog = page.getByRole('dialog', { name: `Reactivate card ${card.card_number}?` });
    await dialog.getByLabel('Note (optional)').fill('Found in the locker room');
    await dialog.getByRole('button', { name: 'Reactivate card' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(toasts(page)).toContainText(`Card ${card.card_number} works again.`);
    await expect(row).toContainText(cardWithStatus(card.card_number, 'Active'));
    await expect(row.getByRole('button', { name: 'Deactivate' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);

    // Typed the way it might be read off the card: lower case, with spaces.
    await checkInAtDesk(page, card.card_number.toLowerCase().replace(/-/g, ' '));
    await expect(page.getByText('Access granted').first()).toBeVisible();
    await expect(page.getByText(member.name).first()).toBeVisible();
    expect((await memberDetail(request, admin, member.id)).attendance_count).toBe(1);
  } finally {
    await removeMembers(request, admin, [member]);
  }
});

test("a member's details list every card they were given, newest first, with each card's history", async ({ page, request }, testInfo) => {
  const admin = await signInAs(page, request, 'admin');
  const member = await createMember(request, admin, unique('Card History', testInfo));
  try {
    const first = await issueCard(request, admin, member.id, 'First card, handed over at the desk');
    await openIdCards(page, member.name);
    await rowOf(page, member.name).getByRole('button', { name: 'Details' }).click();

    const details = page.getByRole('dialog', { name: member.name, exact: true });
    await expect(details.getByRole('heading', { name: 'ID cards' })).toBeVisible();
    await details.getByRole('button', { name: 'Replace card' }).click();
    const confirm = page.getByRole('dialog', { name: 'Replace the ID card?' });
    await expect(confirm).toContainText(`Card ${first.card_number} stops working at check-in at once.`);
    await confirm.getByRole('button', { name: 'Replace card' }).click();
    await expect(confirm).toHaveCount(0);

    const [second] = (await memberDetail(request, admin, member.id)).id_cards;
    expect(second).toMatchObject({ status: 'active', replaces_card_id: first.id });
    await expect(toasts(page)).toContainText(`ID card ${second.card_number} issued to ${member.name}. The old card ${first.card_number} no longer works.`);

    // Newest first: the new card, then the one it replaced with its whole history.
    const histories = details.getByRole('list', { name: /^History of card / });
    await expect(histories).toHaveCount(2);
    await expect(histories.first()).toHaveAccessibleName(`History of card ${second.card_number}`);
    await expect(histories.last()).toHaveAccessibleName(`History of card ${first.card_number}`);

    const newEvents = histories.first().getByRole('listitem');
    await expect(newEvents).toHaveCount(1);
    await expect(newEvents.first()).toContainText('Issued');
    await expect(details.getByText(`replaces ${first.card_number}`)).toBeVisible();

    const oldEvents = histories.last().getByRole('listitem');
    await expect(oldEvents).toHaveCount(2);
    await expect(oldEvents.first()).toContainText('Issued');
    await expect(oldEvents.first()).toContainText('First card, handed over at the desk');
    await expect(oldEvents.last()).toContainText('Deactivated (replaced)');
    await expect(oldEvents.last()).toContainText(`Replaced by ${second.card_number}`);
    // One card works at a time, so the old card cannot come back while the new one is active.
    await expect(details.getByRole('button', { name: 'Reactivate' })).toHaveCount(0);

    // The ID card button shows the card that works now.
    await details.getByRole('button', { name: 'ID card', exact: true }).click();
    const cardDialog = page.getByRole('dialog', { name: `${member.name}'s ID card` });
    await expect(cardDialog).toHaveAccessibleDescription(`Card ${second.card_number}, issued at the front desk. Its QR code works at check-in.`);
    await page.keyboard.press('Escape');
    await expect(cardDialog).toHaveCount(0);
    await expect(details).toBeVisible();
  } finally {
    await removeMembers(request, admin, [member]);
  }
});

test('the demo member sees the number of their own active card in their ID card dialog', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member');
  // The seed gives the demo member an active card, and no test changes it.
  const res = await request.get('/api/id-cards/mine', { headers: auth(token) });
  expect(res.ok(), await res.text()).toBeTruthy();
  const mine = (await res.json()).data.card as Card;
  expect(mine.status).toBe('active');
  // The holder's copy leaves out the desk's notes, history and staff names.
  expect(Object.keys(mine).sort()).toEqual(['card_number', 'deactivated_at', 'deactivation_reason', 'id', 'issued_at', 'status']);

  await page.goto('/profile');
  await page.getByRole('button', { name: 'ID card' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'My ID card' });
  await expect(dialog).toHaveAccessibleDescription(`Your PulseFit card ${mine.card_number}. Its QR code gets you in at the front desk.`);
  await expect(dialog.getByRole('button', { name: 'Show the back of the card' })).toHaveAccessibleDescription(
    new RegExp(`member ID PF-\\d{2}-[0-9A-Z]{6}, .* Card ${mine.card_number}, active\\.$`)
  );
});

test('a member whose card was deactivated is told to ask the desk for a new one, and shown the app pass', async ({ page, request }, testInfo) => {
  const admin = await adminApiToken(request);
  const member = await createMember(request, admin, unique('Card Own', testInfo));
  try {
    const card = await issueCard(request, admin, member.id);
    await deactivateCard(request, admin, card.id, 'stolen');
    const login = await request.post('/api/auth/login', { data: { email: member.email, password: member.password } });
    expect(login.ok(), await login.text()).toBeTruthy();
    const token = (await login.json()).data.token as string;
    await useSession(page, token);

    await page.goto('/profile');
    await page.getByRole('button', { name: 'ID card' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'My ID card' });
    await expect(dialog).toHaveAccessibleDescription('Your digital PulseFit card, with your app pass.');
    await expect(dialog).toContainText(
      new RegExp(`Your card ${card.card_number} was deactivated on .+ \\(stolen\\)\\. Ask the front desk for a new one; until then, check in with your app pass\\.`)
    );
    // The card drawn is the app pass, so it names no issued card.
    const face = dialog.getByRole('button', { name: 'Show the back of the card' });
    await expect(face).toHaveAccessibleDescription(/member ID PF-\d{2}-[0-9A-Z]{6}/);
    await expect(face).not.toHaveAccessibleDescription(/Card PFC-/);
  } finally {
    await removeMembers(request, admin, [member]);
  }
});
