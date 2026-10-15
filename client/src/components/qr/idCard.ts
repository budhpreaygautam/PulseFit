import { User } from '../../types/index.js';
import { formatDate } from '../../lib/format.js';
import { GYM_ADDRESS, GYM_EMAIL, GYM_NAME, GYM_PHONE_DISPLAY, HOURS_DAYS, HOURS_TIME } from '../public/gymInfo.js';

// The ID card is a vertical badge, like a company employee card, drawn on canvas at real card size
// (CR80 portrait, 54 x 85.6 mm) at 300 dpi, so one drawing serves the screen and the PNG download. The
// physical card is issued by the gym, so the app does not print it. The header and footer are
// colour-coded by role; the body follows the app's theme. The lanyard slot is cut out of the image, so
// whatever is behind the card shows through it.

export const CARD_WIDTH = 638;
export const CARD_HEIGHT = 1012;
const RADIUS = 34;

/** Header/footer gradient and accent text colours for each role. */
export const ROLE_STYLES: Record<string, { label: string; gradient: [string, string, string]; accentLight: string; accentDark: string }> = {
  member: { label: 'MEMBER', gradient: ['#a3e635', '#22c55e', '#0d9488'], accentLight: '#15803d', accentDark: '#86efac' },
  trainer: { label: 'COACH', gradient: ['#22d3ee', '#3b82f6', '#8b5cf6'], accentLight: '#1d4ed8', accentDark: '#93c5fd' },
  admin: { label: 'ADMIN', gradient: ['#fbbf24', '#f97316', '#ec4899'], accentLight: '#c2410c', accentDark: '#fdba74' }
};

interface Palette {
  body: [string, string];
  text: string;
  subtext: string;
  label: string;
  panelFill: string;
  panelStroke: string;
  pattern: string;
  photoShadow: string;
}

const LIGHT: Palette = {
  body: ['#ffffff', '#eef2f7'],
  text: '#0f172a',
  subtext: '#475569',
  label: '#64748b',
  panelFill: 'rgba(241, 245, 249, 0.9)',
  panelStroke: 'rgba(148, 163, 184, 0.35)',
  pattern: 'rgba(15, 23, 42, 0.045)',
  photoShadow: 'rgba(15, 23, 42, 0.3)'
};

const DARK: Palette = {
  body: ['#141c2b', '#090e18'],
  text: '#f8fafc',
  subtext: '#cbd5e1',
  label: '#94a3b8',
  panelFill: 'rgba(255, 255, 255, 0.06)',
  panelStroke: 'rgba(255, 255, 255, 0.14)',
  pattern: 'rgba(255, 255, 255, 0.04)',
  photoShadow: 'rgba(0, 0, 0, 0.65)'
};

const STATUS_TEXT: Record<string, { label: string; light: string; dark: string }> = {
  active: { label: 'Active', light: '#15803d', dark: '#86efac' },
  frozen: { label: 'Frozen', light: '#1d4ed8', dark: '#93c5fd' },
  expired: { label: 'Expired', light: '#be123c', dark: '#fda4af' },
  pending: { label: 'No active plan', light: '#475569', dark: '#cbd5e1' }
};

const STAFF_ROLE_LABELS: Record<string, string> = { trainer: 'Coach', admin: 'Admin' };
// The PulseFit dumbbell mark (the favicon's paths, on a 24-unit grid).
const DUMBBELL_PATHS = ['m6.5 6.5 11 11', 'm21 21-1-1', 'm3 3 1 1', 'm18 22 4-4', 'm2 6 4-4', 'm3 10 7-7', 'm14 21 7-7'];

const SANS = 'Inter, system-ui, sans-serif';
const DISPLAY = 'Outfit, Inter, system-ui, sans-serif';
const MONO = 'ui-monospace, Consolas, monospace';

/**
 * A short, stable card number derived from the account id (not the pass code, which is the
 * check-in credential): PF-<year joined>-<6 characters>.
 */
export function cardNumber(user: Pick<User, 'id' | 'created_at'>): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < user.id.length; i++) {
    hash ^= user.id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const code = hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `PF-${user.created_at.slice(2, 4)}-${code}`;
}

export const roleStyleOf = (role: string) => ROLE_STYLES[role] ?? ROLE_STYLES.member;

export interface IdCardFaces {
  front: string;
  back: string;
}

export interface IdCardDetails {
  user: User;
  planName: string;
  qrDataUrl: string;
  theme: 'light' | 'dark';
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

function roleGradient(ctx: CanvasRenderingContext2D, colours: [string, string, string], x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, colours[0]);
  g.addColorStop(0.55, colours[1]);
  g.addColorStop(1, colours[2]);
  return g;
}

/** Card body: theme background with a fine dot pattern, clipped to the card's rounded shape. */
function drawBody(ctx: CanvasRenderingContext2D, p: Palette) {
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS);
  ctx.clip();
  const body = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  body.addColorStop(0, p.body[0]);
  body.addColorStop(1, p.body[1]);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = p.pattern;
  for (let y = 16; y < CARD_HEIGHT; y += 20) {
    for (let x = 16 + ((y / 20) % 2) * 10; x < CARD_WIDTH; x += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The colourful header: two layered waves, soft circles and fine diagonal lines. */
function drawHeader(ctx: CanvasRenderingContext2D, colours: [string, string, string], height: number) {
  const W = CARD_WIDTH;
  // Back wave, a little lower and translucent, for depth.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, height + 10);
  ctx.bezierCurveTo(W * 0.72, height + 110, W * 0.32, height - 40, 0, height + 60);
  ctx.closePath();
  ctx.fillStyle = roleGradient(ctx, colours, W, 0, 0, height);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, height - 30);
  ctx.bezierCurveTo(W * 0.7, height + 60, W * 0.35, height - 80, 0, height + 20);
  ctx.closePath();
  ctx.fillStyle = roleGradient(ctx, colours, 0, 0, W, height);
  ctx.fill();
  ctx.clip();
  // Soft light circles and fine diagonal lines on the colour.
  for (const [cx, cy, r, a] of [
    [W * 0.88, 40, 170, 0.16],
    [W * 0.08, height - 40, 110, 0.12],
    [W * 0.55, -60, 120, 0.1]
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  for (let x = -height; x < W; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, height + 40);
    ctx.lineTo(x + height + 40, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/** The coloured footer band with a wave edge. Returns its top. */
function drawFooter(ctx: CanvasRenderingContext2D, colours: [string, string, string], top: number) {
  const W = CARD_WIDTH;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, top + 20);
  ctx.bezierCurveTo(W * 0.3, top - 30, W * 0.65, top + 50, W, top);
  ctx.lineTo(W, CARD_HEIGHT);
  ctx.lineTo(0, CARD_HEIGHT);
  ctx.closePath();
  ctx.fillStyle = roleGradient(ctx, colours, 0, top, W, CARD_HEIGHT);
  ctx.fill();
  ctx.restore();
}

/** Cut the lanyard slot out of the card and give it a bright rim. */
function cutSlot(ctx: CanvasRenderingContext2D) {
  const w = 132;
  const h = 24;
  const x = (CARD_WIDTH - w) / 2;
  const y = 34;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, x - 1, y - 1, w + 2, h + 2, h / 2 + 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, size * 0.28);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const scale = (size * 0.62) / 24;
  ctx.translate(x + size * 0.19, y + size * 0.19);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of DUMBBELL_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
}

/** A frosted white pill with white text, for the role tag on the coloured header. */
function drawHeaderPill(ctx: CanvasRenderingContext2D, text: string, right: number, y: number) {
  ctx.save();
  ctx.font = `800 18px ${SANS}`;
  const w = ctx.measureText(text).width + 36;
  roundedRect(ctx, right - w, y, w, 40, 20);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, right - w + 18, y + 21);
  ctx.restore();
}

/** An iridescent hologram seal with the PF monogram. */
function drawHologram(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const stops = ['#a3e635', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#a3e635'];
  const conic = (ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
  const foil = conic ? conic.call(ctx, 0, cx, cy) : ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  stops.forEach((c, i) => foil.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = foil;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const milk = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  milk.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
  milk.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
  milk.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
  ctx.fillStyle = milk;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6 * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = `800 ${Math.round(r * 0.7)}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillText('PF', cx, cy + 2);
  ctx.restore();
}

/** Fit a single line of text into maxWidth by shrinking the font, down to minSize. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weightFamily: (size: number) => string, size: number, minSize: number, maxWidth: number): number {
  let s = size;
  ctx.font = weightFamily(s);
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = weightFamily(s);
  }
  return s;
}

/** Wrap text into lines no wider than maxWidth; returns the y after the last line. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
  return cursor + lineHeight;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Round photo with a white gap and a colourful gradient ring, lifted off the card. */
async function drawPhoto(ctx: CanvasRenderingContext2D, p: Palette, user: User, colours: [string, string, string], cx: number, cy: number, r: number) {
  ctx.save();
  ctx.shadowColor = p.photoShadow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  const conic = (ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
  const ring = conic ? conic.call(ctx, -Math.PI / 2, cx, cy) : roleGradient(ctx, colours, cx - r, cy - r, cx + r, cy + r);
  [colours[0], colours[1], colours[2], colours[0]].forEach((c, i) => ring.addColorStop(i / 3, c));
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  let photo: HTMLImageElement | null = null;
  if (user.avatar_url) {
    try {
      photo = await loadImage(user.avatar_url, !user.avatar_url.startsWith('data:'));
    } catch {
      photo = null;
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const scale = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    ctx.drawImage(photo, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = roleGradient(ctx, colours, cx - r, cy - r, cx + r, cy + r);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(r * 0.8)}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(user.name), cx, cy + 4);
  }
  ctx.restore();
}

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not draw the card.');
  return [canvas, ctx];
}

/** A canvas holding a cross-origin photo cannot be exported; then redraw with initials instead. */
function exportOrNull(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Brand row on the header: logo square, wordmark and location. */
function drawBrandRow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawLogo(ctx, x, y, 62);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 36px ${DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PULSEFIT', x + 78, y + 34);
  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('Sector 29 · Gurugram', x + 80, y + 58);
  ctx.restore();
}

async function drawFront({ user, planName, theme }: IdCardDetails, withPhoto: boolean): Promise<string | null> {
  const p = theme === 'light' ? LIGHT : DARK;
  const role = roleStyleOf(user.role);
  const accent = theme === 'light' ? role.accentLight : role.accentDark;
  const isStaff = user.role !== 'member';
  const W = CARD_WIDTH;
  const [canvas, ctx] = newCanvas();

  ctx.save();
  drawBody(ctx, p);
  drawHeader(ctx, role.gradient, 300);
  drawFooter(ctx, role.gradient, 918);
  ctx.restore();

  drawBrandRow(ctx, 40, 82);
  drawHeaderPill(ctx, role.label, W - 40, 92);

  await drawPhoto(ctx, p, withPhoto ? user : { ...user, avatar_url: undefined }, role.gradient, W / 2, 392, 118);

  // Name and designation, centred.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p.text;
  fitText(ctx, user.name, s => `800 ${s}px ${DISPLAY}`, 46, 28, W - 80);
  ctx.fillText(user.name, W / 2, 584);
  const designation = isStaff ? `${STAFF_ROLE_LABELS[user.role] ?? 'Staff'} · PulseFit staff` : user.membership_tier === 'none' ? 'No plan yet' : planName;
  ctx.fillStyle = accent;
  fitText(ctx, designation, s => `700 ${s}px ${SANS}`, 23, 16, W - 100);
  ctx.fillText(designation, W / 2, 624);
  // A short gradient rule under the designation.
  ctx.fillStyle = roleGradient(ctx, role.gradient, W / 2 - 60, 0, W / 2 + 60, 0);
  roundedRect(ctx, W / 2 - 60, 642, 120, 6, 3);
  ctx.fill();
  ctx.textAlign = 'left';

  // Details panel.
  roundedRect(ctx, 40, 672, W - 80, 196, 24);
  ctx.fillStyle = p.panelFill;
  ctx.fill();
  ctx.strokeStyle = p.panelStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  const status = STATUS_TEXT[user.membership_status] ?? STATUS_TEXT.pending;
  const since = formatDate(user.created_at, { month: 'short', year: 'numeric' });
  const rows: [string, string, string?][][] = isStaff
    ? [
        [['STAFF ID', cardNumber(user)], ['ROLE', STAFF_ROLE_LABELS[user.role] ?? 'Staff']],
        [['JOINED', since], ['ACCESS', 'All areas']]
      ]
    : [
        [['MEMBER ID', cardNumber(user)], ['VALID TILL', user.membership_expiry ? formatDate(user.membership_expiry, { day: 'numeric', month: 'short', year: 'numeric' }) : '—']],
        [['MEMBER SINCE', since], ['STATUS', status.label, theme === 'light' ? status.light : status.dark]]
      ];
  const cols = [72, W / 2 + 12];
  rows.forEach((row, ri) => {
    const labelY = 716 + ri * 90;
    row.forEach(([label, value, colour], ci) => {
      ctx.font = `700 15px ${SANS}`;
      ctx.fillStyle = p.label;
      ctx.fillText(label, cols[ci], labelY);
      ctx.font = ci === 0 && ri === 0 ? `700 24px ${MONO}` : `700 24px ${SANS}`;
      ctx.fillStyle = colour ?? p.text;
      ctx.fillText(value, cols[ci], labelY + 34, W / 2 - 52);
    });
  });

  drawHologram(ctx, W - 92, 900, 38);

  ctx.textAlign = 'center';
  ctx.font = `700 18px ${SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(GYM_NAME.toUpperCase(), W / 2, 966);
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('Personal and non-transferable', W / 2, 990);
  ctx.textAlign = 'left';

  cutSlot(ctx);
  return exportOrNull(canvas);
}

async function drawBack({ user, qrDataUrl, theme }: IdCardDetails): Promise<string> {
  const p = theme === 'light' ? LIGHT : DARK;
  const role = roleStyleOf(user.role);
  const accent = theme === 'light' ? role.accentLight : role.accentDark;
  const W = CARD_WIDTH;
  const [canvas, ctx] = newCanvas();

  ctx.save();
  drawBody(ctx, p);
  drawHeader(ctx, role.gradient, 150);
  drawFooter(ctx, role.gradient, 930);
  ctx.restore();

  // Centred brand row on the header.
  ctx.save();
  ctx.font = `800 36px ${DISPLAY}`;
  const rowWidth = 62 + 16 + ctx.measureText('PULSEFIT').width;
  ctx.restore();
  drawBrandRow(ctx, (W - rowWidth) / 2, 78);

  ctx.textAlign = 'center';
  ctx.font = `800 34px ${DISPLAY}`;
  ctx.fillStyle = p.text;
  ctx.fillText('Scan to check in', W / 2, 252);
  ctx.font = `500 17px ${SANS}`;
  ctx.fillStyle = p.subtext;
  ctx.fillText('Show this side at the front desk', W / 2, 280);

  // QR tile with a role-gradient frame (white inside: scanners need the contrast).
  const size = 330;
  const qx = (W - size) / 2;
  const qy = 304;
  ctx.save();
  ctx.shadowColor = p.photoShadow;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, qx - 8, qy - 8, size + 16, size + 16, 30);
  ctx.fillStyle = roleGradient(ctx, role.gradient, qx, qy, qx + size, qy + size);
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, qx, qy, size, size, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const qr = await loadImage(qrDataUrl, false);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx + 13, qy + 13, size - 26, size - 26);
  ctx.imageSmoothingEnabled = true;

  ctx.font = `700 22px ${MONO}`;
  ctx.fillStyle = p.text;
  ctx.fillText(user.qr_code_token, W / 2, qy + size + 50, W - 80);
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = p.label;
  ctx.fillText('PASS CODE', W / 2, qy + size + 74);
  ctx.textAlign = 'left';

  // Gym details.
  roundedRect(ctx, 40, 724, W - 80, 186, 24);
  ctx.fillStyle = p.panelFill;
  ctx.fill();
  ctx.strokeStyle = p.panelStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  let y = 760;
  const row = (label: string, value: string) => {
    ctx.font = `800 13px ${SANS}`;
    ctx.fillStyle = accent;
    ctx.fillText(label, 68, y);
    ctx.font = `500 16px ${SANS}`;
    ctx.fillStyle = p.text;
    y = wrapText(ctx, value, 68, y + 22, W - 136, 21) + 6;
  };
  row('OPENING HOURS', `${HOURS_DAYS}, ${HOURS_TIME} · Sunday closed`);
  row('ADDRESS', GYM_ADDRESS);
  row('CONTACT', `${GYM_PHONE_DISPLAY} · ${GYM_EMAIL}`);

  ctx.textAlign = 'center';
  ctx.font = `600 14px ${SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Property of ${GYM_NAME}.`, W / 2, 974);
  ctx.fillText('If found, please return it to the front desk.', W / 2, 994);
  ctx.textAlign = 'left';

  cutSlot(ctx);
  return canvas.toDataURL('image/png');
}

/** Draw both faces. A photo the browser will not let us export is replaced by initials. */
export async function renderIdCard(details: IdCardDetails): Promise<IdCardFaces> {
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`800 46px ${DISPLAY}`),
      document.fonts.load(`700 23px ${SANS}`),
      document.fonts.load(`500 16px ${SANS}`)
    ]).catch(() => undefined);
  }
  const front = (await drawFront(details, true)) ?? (await drawFront(details, false));
  if (!front) throw new Error('Your browser could not draw the card.');
  const back = await drawBack(details);
  return { front, back };
}

/** Both faces side by side in one PNG for the download. */
export async function stackedPng(faces: IdCardFaces): Promise<Blob> {
  const gap = 48;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * 2 + gap;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the image.');
  const [front, back] = await Promise.all([loadImage(faces.front, false), loadImage(faces.back, false)]);
  ctx.drawImage(front, 0, 0);
  ctx.drawImage(back, CARD_WIDTH + gap, 0);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be saved.'))), 'image/png'));
}
