import config from '../config.js';
import { GYM } from './seo.js';

// Email through Brevo's HTTP API (https://developers.brevo.com/reference/sendtransacemail). HTTPS, not SMTP:
// Railway blocks SMTP below its Pro plan. Brevo builds the message from JSON, so nothing passed here can add a header.

export interface Mail {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

type MailSender = (mail: Mail) => Promise<void>;

const brevo: MailSender = async mail => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.mail.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: config.mail.from, name: GYM.name },
      to: [{ email: mail.to }],
      ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  });
  // The status only: Brevo's error text can repeat the addresses.
  if (!res.ok) throw new Error(`Brevo answered ${res.status}`);
};

let sender: MailSender = brevo;

export const sendMail = (mail: Mail) => sender(mail);

/** Replace the sender so tests never call Brevo; pass null to restore the real one. */
export function setMailSenderForTests(fake: MailSender | null): void {
  sender = fake ?? brevo;
}
