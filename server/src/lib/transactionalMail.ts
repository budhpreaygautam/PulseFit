import { emailConfigured } from '../config.js';
import db from '../db/database.js';
import { displayDate } from './dates.js';
import { sendMail, type Mail } from './mailer.js';
import { GYM, escapeHtml } from './seo.js';
import { Booking, MembershipPlan, Payment, User } from '../types/index.js';

// Mail for the member's own actions. Each function returns at once: nothing is awaited, nothing throws, and nothing is
// sent unless email is set up. The log carries the record id and the reason only, never an address or a name.

const paragraphs = (lines: string[]) => lines.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
const signOff = () => `${GYM.name}\n${db.gym_contact.phone}`;

function fire(kind: string, id: string, make: () => Mail): void {
  if (!emailConfigured()) return;
  void (async () => {
    try {
      await sendMail(make());
    } catch (err) {
      console.error(`✉️  ${kind} ${id}: the email failed (${err instanceof Error ? err.message : 'unknown error'})`);
    }
  })();
}

const compose = (to: string, subject: string, lines: string[]): Mail => ({
  to,
  subject: `${subject} · ${GYM.name}`,
  text: lines.join('\n\n'),
  html: paragraphs(lines)
});

export function sendResetLink(user: Pick<User, 'id' | 'email' | 'name'>, link: string): void {
  fire('Password reset for account', user.id, () =>
    compose(user.email, 'Reset your password', [
      `Hello ${user.name},`,
      `Use this link to choose a new password. It works once and is valid for 30 minutes:\n${link}`,
      'If you did not ask for this, you can ignore this email; your password stays as it is.',
      signOff()
    ])
  );
}

export function sendBookingConfirmation(booking: Booking, user: Pick<User, 'email' | 'name'>, cls: { title: string; start_time: string; room?: string }): void {
  fire('Booking', booking.id, () =>
    compose(user.email, `Booked: ${cls.title}`, [
      `Hello ${user.name},`,
      `Your spot is booked.\nClass: ${cls.title}\nDate: ${displayDate(booking.booking_date)}\nTime: ${cls.start_time}${cls.room ? `\nRoom: ${cls.room}` : ''}`,
      signOff()
    ])
  );
}

export function sendPaymentReceipt(payment: Payment, user: Pick<User, 'email' | 'name'>, plan: Pick<MembershipPlan, 'name'>): void {
  fire('Payment', payment.id, () =>
    compose(user.email, `Payment receipt ${payment.invoice_number}`, [
      `Hello ${user.name},`,
      `Thank you, we have received your payment.\nPlan: ${plan.name}\nAmount: ₹${payment.amount_inr}\nReference: ${payment.razorpay_payment_id || payment.invoice_number}\nActive until: ${displayDate(payment.period_end)}`,
      signOff()
    ])
  );
}
