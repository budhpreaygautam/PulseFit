# Gym contact details, WhatsApp and social links — design (short)

Approved in conversation on 2026-11-20.

The email and phone the website and app show (`contact@pulsefit.in`, `+91 98110 78573`) are not the
gym's own yet: `pulsefit.in` is a domain someone else runs. The owner is getting a domain, a mailbox
and a front-desk SIM ("need to setup work email and phone. do somthing"), and asked for "social media
icons for follow on social media. and visit web app for more detail". When the new details exist, the
owner must be able to put them in once, without a developer or a new app release.

## Goals

- **One "Gym contact details" setting in Admin:** phone, WhatsApp number (optional), email, and links
  to Instagram, Facebook, YouTube and X (each optional). Admins edit it; the server checks it (an
  Indian phone number as the forms already check it, an email address, an `https://` link on that
  network's own site).
- **Live everywhere:** served with the public `GET /api/config`, so the website and the installed app
  pick a change up without a release. Its starting values are today's, so nothing changes until the
  owner edits it.
- **Used wherever the details show today:** the footer's Visit us block, the policies' contact part,
  payment messages, the payment status page, ID cards, the app's Visit us and Policies & terms
  pages, and on the server the gym details Google reads (`server/src/lib/seo.ts`) and the enquiry
  emails.
- **WhatsApp us** button (a `wa.me` link) on Visit us and Contact when a WhatsApp number is set.
- **Social icons**, only for the links filled in, picked by the owner:
  - at the very end of the app's drawer, one slim row: the icons and "Visit our website ↗";
  - on the app's Visit us page, a "Follow us" section with the icons and a "Visit our website"
    button;
  - in the website's footer, the icons (no "Visit our website": it is the website).
- **"Visit our website"** opens the site's public address (the server's `PUBLIC_URL`) in the
  browser, outside the app.

## Non-goals and anti-goals

- Non-goals: buying the domain or SIM, setting up the mailbox or Brevo (the owner does these), the
  gym's address.
- Anti-goals: guessed social links (they would send people to strangers' pages); a link that opens
  inside the app's WebView; details that need a new APK to change; a typo that breaks every call or
  email button (hence the checks).

## Approaches

- **A, an Admin setting served with `/api/config` (picked):** the owner changes it alone, at once,
  in the website and the app.
- B, Railway variables: the owner would edit server settings, and the app would still need them
  passed through.
- C, constants in the code (today): every change needs a developer and, for the app, a release.

## Calls left to the builder

- Where the panel sits in Admin (next to the other settings) and its wording.
- Brand icons as small inline SVGs if the icon library has none.
- Built after the phone-test changes (`2026-11-20-android-app-drawer-design.md`), which touch the
  same files.
