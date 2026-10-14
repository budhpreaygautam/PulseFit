import { User } from '../../types/index.js';
import { formatDate } from '../../lib/format.js';
import { GYM_ADDRESS, GYM_EMAIL, GYM_NAME, GYM_PHONE_DISPLAY, HOURS_DAYS, HOURS_TIME } from '../public/gymInfo.js';

// The ID card is drawn on canvas at the size of a real card (CR80, 85.6 x 54 mm) at 300 dpi, so one
// drawing serves the screen, the PNG download and printing. The design is dark glass on purpose, in
// both themes: it is a physical card, not a page.

export const CARD_WIDTH = 1012;
export const CARD_HEIGHT = 638;
const RADIUS = 38;

const STAFF_ROLE_LABELS: Record<string, string> = { trainer: 'Coach', admin: 'Admin' };
const ROLE_CHIPS: Record<string, { label: string; text: string; fill: string; edge: string }> = {
  member: { label: 'MEMBER', text: '#bef264', fill: 'rgba(132, 204, 22, 0.16)', edge: 'rgba(163, 230, 53, 0.55)' },
  trainer: { label: 'COACH', text: '#67e8f9', fill: 'rgba(6, 182, 212, 0.16)', edge: 'rgba(103, 232, 249, 0.5)' },
  admin: { label: 'ADMIN', text: '#fcd34d', fill: 'rgba(245, 158, 11, 0.16)', edge: 'rgba(252, 211, 77, 0.5)' }
};
const STATUS_CHIPS: Record<string, { label: string; text: string; fill: string; edge: string }> = {
  active: { label: 'ACTIVE', text: '#bef264', fill: 'rgba(132, 204, 22, 0.14)', edge: 'rgba(163, 230, 53, 0.45)' },
  frozen: { label: 'FROZEN', text: '#93c5fd', fill: 'rgba(59, 130, 246, 0.16)', edge: 'rgba(147, 197, 253, 0.45)' },
  expired: { label: 'EXPIRED', text: '#fda4af', fill: 'rgba(225, 29, 72, 0.16)', edge: 'rgba(253, 164, 175, 0.45)' },
  pending: { label: 'NO ACTIVE PLAN', text: '#cbd5e1', fill: 'rgba(148, 163, 184, 0.16)', edge: 'rgba(203, 213, 225, 0.4)' }
};
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

export interface IdCardFaces {
  front: string;
  back: string;
}

export interface IdCardDetails {
  user: User;
  planName: string;
  qrDataUrl: string;
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

/** The card's background: dark glass with a lime glow and a soft pink one, and a bright rim. */
function drawBackground(ctx: CanvasRenderingContext2D) {
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS);
  ctx.save();
  ctx.clip();
  const base = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  base.addColorStop(0, '#162033');
  base.addColorStop(0.55, '#0c1322');
  base.addColorStop(1, '#060a12');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const lime = ctx.createRadialGradient(CARD_WIDTH * 0.95, -30, 0, CARD_WIDTH * 0.95, -30, 470);
  lime.addColorStop(0, 'rgba(132, 204, 22, 0.42)');
  lime.addColorStop(1, 'rgba(132, 204, 22, 0)');
  ctx.fillStyle = lime;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const pink = ctx.createRadialGradient(-40, CARD_HEIGHT + 40, 0, -40, CARD_HEIGHT + 40, 420);
  pink.addColorStop(0, 'rgba(236, 72, 153, 0.22)');
  pink.addColorStop(1, 'rgba(236, 72, 153, 0)');
  ctx.fillStyle = pink;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // A faint diagonal sheen across the glass.
  const sheen = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  sheen.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.05)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  roundedRect(ctx, 1.5, 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3, RADIUS - 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** A frosted glass panel with a bright top edge. */
function drawGlassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  const edge = ctx.createLinearGradient(x, y, x, y + 40);
  edge.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  edge.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 40);
  ctx.restore();
}

function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, chip: { label: string; text: string; fill: string; edge: string }, align: 'left' | 'right') {
  ctx.save();
  ctx.font = `700 19px ${SANS}`;
  const width = ctx.measureText(chip.label).width + 40;
  const left = align === 'right' ? x - width : x;
  roundedRect(ctx, left, y, width, 42, 21);
  ctx.fillStyle = chip.fill;
  ctx.fill();
  ctx.strokeStyle = chip.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = chip.text;
  ctx.textBaseline = 'middle';
  ctx.fillText(chip.label, left + 20, y + 22);
  ctx.restore();
}

/** Logo square, wordmark and location line, top left. */
function drawBrand(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = 'rgba(132, 204, 22, 0.45)';
  ctx.shadowBlur = 24;
  roundedRect(ctx, 56, 44, 76, 76, 22);
  const lime = ctx.createLinearGradient(56, 44, 132, 120);
  lime.addColorStop(0, '#bef264');
  lime.addColorStop(1, '#84cc16');
  ctx.fillStyle = lime;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(70, 58);
  ctx.scale(2, 2);
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of DUMBBELL_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 44px ${DISPLAY}`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('PULSE', 154, 92);
  const pulseWidth = ctx.measureText('PULSE').width;
  ctx.fillStyle = '#a3e635';
  ctx.fillText('FIT', 154 + pulseWidth, 92);
  ctx.font = `500 19px ${SANS}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Sector 29 · Gurugram', 156, 120);
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

async function drawPhoto(ctx: CanvasRenderingContext2D, user: User, x: number, y: number, w: number, h: number) {
  // A soft neumorphic lift under the frame.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.restore();

  let photo: HTMLImageElement | null = null;
  if (user.avatar_url) {
    try {
      photo = await loadImage(user.avatar_url, !user.avatar_url.startsWith('data:'));
    } catch {
      photo = null;
    }
  }

  ctx.save();
  roundedRect(ctx, x, y, w, h, 28);
  ctx.clip();
  if (photo) {
    // Cover the frame, keeping the photo's proportions.
    const scale = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#334155');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#bef264';
    ctx.font = `800 92px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(user.name), x + w / 2, y + h / 2 + 4);
  }
  ctx.restore();

  roundedRect(ctx, x, y, w, h, 28);
  ctx.strokeStyle = 'rgba(163, 230, 53, 0.85)';
  ctx.lineWidth = 4;
  ctx.stroke();
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

async function drawFront({ user, planName }: IdCardDetails, withPhoto: boolean): Promise<string | null> {
  const [canvas, ctx] = newCanvas();
  const isStaff = user.role !== 'member';
  drawBackground(ctx);
  drawBrand(ctx);
  drawChip(ctx, CARD_WIDTH - 56, 60, ROLE_CHIPS[user.role] ?? ROLE_CHIPS.member, 'right');

  drawGlassPanel(ctx, 40, 166, CARD_WIDTH - 80, 404, 32);
  await drawPhoto(ctx, withPhoto ? user : { ...user, avatar_url: undefined }, 76, 200, 232, 292);

  const textX = 346;
  const textWidth = CARD_WIDTH - textX - 76;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  fitText(ctx, user.name, s => `800 ${s}px ${DISPLAY}`, 54, 30, textWidth);
  ctx.fillText(user.name, textX, 262);

  ctx.font = `600 25px ${SANS}`;
  ctx.fillStyle = '#bef264';
  const subtitle = isStaff ? `${STAFF_ROLE_LABELS[user.role] ?? 'Staff'} · PulseFit staff` : user.membership_tier === 'none' ? 'No plan yet' : planName;
  fitText(ctx, subtitle, s => `600 ${s}px ${SANS}`, 25, 18, textWidth);
  ctx.fillText(subtitle, textX, 304);

  const fields: [string, string][] = isStaff
    ? [['STAFF ID', cardNumber(user)], ['ROLE', STAFF_ROLE_LABELS[user.role] ?? 'Staff'], ['SINCE', formatDate(user.created_at, { month: 'short', year: 'numeric' })]]
    : [
        ['MEMBER ID', cardNumber(user)],
        ['VALID THRU', user.membership_expiry ? formatDate(user.membership_expiry, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
        ['SINCE', formatDate(user.created_at, { month: 'short', year: 'numeric' })]
      ];
  const columns = [textX, textX + 232, textX + 450];
  fields.forEach(([label, value], i) => {
    ctx.font = `700 16px ${SANS}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(label, columns[i], 368);
    ctx.font = i === 0 ? `700 25px ${MONO}` : `700 25px ${SANS}`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(value, columns[i], 404, (columns[i + 1] ?? CARD_WIDTH - 76) - columns[i] - 16);
  });

  if (!isStaff) drawChip(ctx, textX, 446, STATUS_CHIPS[user.membership_status] ?? STATUS_CHIPS.pending, 'left');
  else {
    ctx.font = `500 19px ${SANS}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Staff pass: no membership needed to check in.', textX, 474, textWidth);
  }

  ctx.font = `500 17px ${SANS}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(`${GYM_NAME} · Personal and non-transferable`, 56, 610);

  // A lime accent along the bottom edge.
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS);
  ctx.clip();
  const bar = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  bar.addColorStop(0, 'rgba(163, 230, 53, 0)');
  bar.addColorStop(0.5, 'rgba(163, 230, 53, 0.9)');
  bar.addColorStop(1, 'rgba(163, 230, 53, 0)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, CARD_HEIGHT - 8, CARD_WIDTH, 8);
  ctx.restore();

  return exportOrNull(canvas);
}

async function drawBack({ user, qrDataUrl }: IdCardDetails): Promise<string> {
  const [canvas, ctx] = newCanvas();
  drawBackground(ctx);

  // Magnetic-stripe band.
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, RADIUS);
  ctx.clip();
  const stripe = ctx.createLinearGradient(0, 52, 0, 132);
  stripe.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  stripe.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 52, CARD_WIDTH, 80);
  ctx.restore();

  // The QR code on a white tile (scanners need the contrast).
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 64, 168, 300, 300, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  const qr = await loadImage(qrDataUrl, false);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 76, 180, 276, 276);
  ctx.imageSmoothingEnabled = true;

  ctx.textAlign = 'center';
  ctx.font = `700 21px ${MONO}`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(user.qr_code_token, 214, 512, 300);
  ctx.font = `600 15px ${SANS}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('PASS CODE', 214, 538);
  ctx.textAlign = 'left';

  const x = 404;
  const width = CARD_WIDTH - x - 56;
  drawGlassPanel(ctx, x - 20, 160, width + 40, 392, 26);
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('Scan at the front desk', x, 210, width);
  ctx.font = `500 18px ${SANS}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('or give the pass code to check in.', x, 240, width);

  let y = 290;
  const row = (label: string, value: string) => {
    ctx.font = `700 15px ${SANS}`;
    ctx.fillStyle = '#a3e635';
    ctx.fillText(label, x, y);
    ctx.font = `500 19px ${SANS}`;
    ctx.fillStyle = '#f1f5f9';
    y = wrapText(ctx, value, x, y + 26, width, 25) + 16;
  };
  row('OPENING HOURS', `${HOURS_DAYS}, ${HOURS_TIME} · Sunday closed`);
  row('ADDRESS', GYM_ADDRESS);
  row('CONTACT', `${GYM_PHONE_DISPLAY} · ${GYM_EMAIL}`);

  ctx.font = `500 15px ${SANS}`;
  ctx.fillStyle = '#64748b';
  wrapText(ctx, `If found, please return it to ${GYM_NAME}. This card is personal and cannot be lent or transferred.`, 56, 592, CARD_WIDTH - 112, 20);

  return canvas.toDataURL('image/png');
}

/** Draw both faces. A photo the browser will not let us export is replaced by initials. */
export async function renderIdCard(details: IdCardDetails): Promise<IdCardFaces> {
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`800 54px ${DISPLAY}`),
      document.fonts.load(`600 25px ${SANS}`),
      document.fonts.load(`700 16px ${SANS}`)
    ]).catch(() => undefined);
  }
  const front = (await drawFront(details, true)) ?? (await drawFront(details, false));
  if (!front) throw new Error('Your browser could not draw the card.');
  const back = await drawBack(details);
  return { front, back };
}

/** Both faces stacked in one PNG for the download. */
export async function stackedPng(faces: IdCardFaces): Promise<Blob> {
  const gap = 48;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT * 2 + gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the image.');
  const [front, back] = await Promise.all([loadImage(faces.front, false), loadImage(faces.back, false)]);
  ctx.drawImage(front, 0, 0);
  ctx.drawImage(back, 0, CARD_HEIGHT + gap);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be saved.'))), 'image/png'));
}

/** Print both faces at real card size (85.6 x 54 mm) from a hidden frame, so the page around it is not printed. */
export function printIdCard(faces: IdCardFaces, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      reject(new Error('Your browser blocked printing.'));
      return;
    }
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>
      @page { size: A4; margin: 15mm; }
      body { margin: 0; font: 10pt system-ui, sans-serif; color: #334155; }
      img { display: block; width: 85.6mm; height: 54mm; margin: 0 0 8mm; }
    </style></head><body>
      <img src="${faces.front}" alt="Front of the card">
      <img src="${faces.back}" alt="Back of the card">
      <p>Print at 100% scale (turn off "fit to page"), then cut along the card edges.</p>
    </body></html>`);
    doc.close();
    const images = Array.from(doc.images);
    Promise.all(images.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; }))))
      .then(() => {
        win.focus();
        win.print();
        setTimeout(() => frame.remove(), 1000);
        resolve();
      })
      .catch(err => {
        frame.remove();
        reject(err);
      });
  });
}
